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
  /** Búsqueda de Google hecha por Gemini (se reenvían tal cual en el historial). */
  toolCall?: unknown;
  toolResponse?: unknown;
};
export type Content = { role: 'user' | 'model'; parts: Part[] };

/** Herramienta tal como la declara `tools.ts` (JSON Schema). Se convierte al formato de Gemini al llamar. */
export type ToolDef = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  strict?: boolean;
};

/** Página web que Gemini consultó con la búsqueda de Google. */
export type Source = { uri: string; title: string };
export type GenerateResult = {
  content: Content;
  finishReason: string | null;
  blockReason: string | null;
  sources: Source[];
  /** Tokens cobrados (el pensamiento cuenta como salida) y búsquedas de Google hechas. */
  usage: { input: number; output: number; searches: number };
};

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
  /** Hora límite (Date.now()) para todo el mensaje: ningún intento se pasa de ahí. */
  deadline?: number;
  /** Activa la búsqueda de Google (internet) junto a las herramientas de DESJ. */
  search?: boolean;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Máximo que se espera cada intento; además nunca se pasa del `deadline` del mensaje completo. */
const TIMEOUT_MS = 25_000;

export async function generate(apiKey: string, model: string, req: GenerateRequest): Promise<GenerateResult> {
  const timeLeft = () => Math.max(1, Math.min(TIMEOUT_MS, (req.deadline ?? Infinity) - Date.now()));
  if (req.deadline && req.deadline - Date.now() < 3000) throw new GeminiError(408, 'Sin tiempo para otro intento');
  let withSearch = Boolean(req.search);
  const send = async (withThinking: boolean) => {
    const tools = [...(withSearch ? [{ googleSearch: {} }] : []), ...(req.tools?.length ? toGeminiTools(req.tools) : [])];
    const body = {
      systemInstruction: { parts: [{ text: req.system }] },
      contents: req.contents,
      ...(tools.length ? { tools } : {}),
      // Para usar la búsqueda junto a las herramientas propias, Gemini pide incluir sus invocaciones en la respuesta.
      ...(withSearch && req.tools?.length ? { toolConfig: { includeServerSideToolInvocations: true } } : {}),
      generationConfig: {
        maxOutputTokens: req.maxOutputTokens ?? 4096,
        ...(withThinking && req.thinkingLevel ? { thinkingConfig: { thinkingLevel: req.thinkingLevel } } : {}),
      },
    };
    return await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      signal: AbortSignal.timeout(timeLeft()),
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
  for (let retry = 1; retry <= 2 && (res.status === 429 || res.status === 503) && timeLeft() > 5000; retry++) {
    await sleep(1500 * retry);
    res = await send(withThinking);
  }
  // Si el modelo no acepta el nivel de pensamiento o la búsqueda, se repite sin eso.
  if (res.status === 400) {
    const text = await res.clone().text();
    if (req.thinkingLevel && /thinking/i.test(text)) {
      withThinking = false;
      res = await send(withThinking);
    } else if (withSearch && /search|tool/i.test(text)) {
      console.error('Gemini sin búsqueda:', text.slice(0, 300));
      withSearch = false;
      res = await send(withThinking);
    }
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error('Gemini', res.status, detail.slice(0, 500));
    throw new GeminiError(res.status, detail.slice(0, 300));
  }

  const data = (await res.json()) as {
    candidates?: {
      content?: Content;
      finishReason?: string;
      groundingMetadata?: { webSearchQueries?: string[]; groundingChunks?: { web?: { uri?: string; title?: string } }[] };
    }[];
    usageMetadata?: { promptTokenCount?: number; toolUsePromptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
    promptFeedback?: { blockReason?: string };
  };
  const candidate = data.candidates?.[0];
  return {
    content: { role: 'model', parts: candidate?.content?.parts ?? [] },
    finishReason: candidate?.finishReason ?? null,
    blockReason: data.promptFeedback?.blockReason ?? null,
    sources: (candidate?.groundingMetadata?.groundingChunks ?? [])
      .map((c) => ({ uri: c.web?.uri ?? '', title: c.web?.title ?? '' }))
      .filter((s) => s.uri),
    usage: {
      input: (data.usageMetadata?.promptTokenCount ?? 0) + (data.usageMetadata?.toolUsePromptTokenCount ?? 0),
      output: (data.usageMetadata?.candidatesTokenCount ?? 0) + (data.usageMetadata?.thoughtsTokenCount ?? 0),
      searches: candidate?.groundingMetadata?.webSearchQueries?.length ?? 0,
    },
  };
}
