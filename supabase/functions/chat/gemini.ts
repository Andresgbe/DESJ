// Cliente mínimo de la API de Gemini (generateContent, REST). Sin SDK: solo fetch, así se entiende y se prueba fácil.
// La API key vive únicamente en los secretos de Supabase (GEMINI_API_KEY); nunca en la app.

export type Part = {
  text?: string;
  /** `true` en los resúmenes del pensamiento del modelo (no son parte de la respuesta). */
  thought?: boolean;
  /** Firma del pensamiento: hay que devolverla tal cual en el turno siguiente (sobre todo con llamadas a herramientas). */
  thoughtSignature?: string;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { id?: string; name: string; args?: Record<string, unknown> };
  functionResponse?: { id?: string; name: string; response: Record<string, unknown> };
};
export type Content = { role: 'user' | 'model'; parts: Part[] };

/** Herramienta tal como la declara `tools.ts` (JSON Schema). Se convierte al formato de Gemini al llamar. */
export type ToolDef = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  strict?: boolean;
};

export type GenerateResult = { content: Content; finishReason: string | null; blockReason: string | null };

export class GeminiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Gemini entiende un subconjunto de JSON Schema: se quitan `additionalProperties`, `strict` y `default`, y los tipos van en mayúsculas. */
function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
    if (k === 'additionalProperties' || k === 'strict' || k === 'default' || k === '$schema') continue;
    out[k] = k === 'type' && typeof v === 'string' ? v.toUpperCase() : toGeminiSchema(v);
  }
  return out;
}

export function toGeminiTools(tools: ToolDef[]) {
  return [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parameters: toGeminiSchema(t.input_schema) })) }];
}

export type GenerateRequest = {
  system: string;
  contents: Content[];
  tools?: ToolDef[];
  maxOutputTokens?: number;
  /** 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH': cuánto "piensa" el modelo antes de responder (más = más lento y más caro). */
  thinkingLevel?: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Máximo que se espera una respuesta de Gemini; si no llega, se corta y la persona ve un aviso en vez de esperar sin fin. */
const TIMEOUT_MS = 50_000;

export async function generate(apiKey: string, model: string, req: GenerateRequest): Promise<GenerateResult> {
  const send = async (withThinking: boolean) => {
    const body = {
      systemInstruction: { parts: [{ text: req.system }] },
      contents: req.contents,
      ...(req.tools?.length ? { tools: toGeminiTools(req.tools) } : {}),
      generationConfig: {
        maxOutputTokens: req.maxOutputTokens ?? 4096,
        ...(withThinking && req.thinkingLevel ? { thinkingConfig: { thinkingLevel: req.thinkingLevel } } : {}),
      },
    };
    return await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
    });
  };

  let withThinking = true;
  let res: Response;
  try {
    res = await send(withThinking);
  } catch (e) {
    if (e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError')) throw new GeminiError(408, 'Gemini no respondió a tiempo');
    throw e;
  }
  // Un error pasajero (límite o saturación) se reintenta hasta 2 veces, esperando un poco más cada vez.
  for (let retry = 1; retry <= 2 && (res.status === 429 || res.status === 503); retry++) {
    await sleep(1500 * retry);
    res = await send(withThinking);
  }
  // Si el modelo no acepta el nivel de pensamiento, se repite sin él.
  if (res.status === 400 && req.thinkingLevel) {
    const text = await res.clone().text();
    if (/thinking/i.test(text)) {
      withThinking = false;
      res = await send(withThinking);
    }
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error('Gemini', res.status, detail.slice(0, 500));
    throw new GeminiError(res.status, detail.slice(0, 300));
  }

  const data = (await res.json()) as {
    candidates?: { content?: Content; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  };
  const candidate = data.candidates?.[0];
  return {
    content: { role: 'model', parts: candidate?.content?.parts ?? [] },
    finishReason: candidate?.finishReason ?? null,
    blockReason: data.promptFeedback?.blockReason ?? null,
  };
}
