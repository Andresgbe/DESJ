// Prueba la clave de Gemini desde tu PC: lista los modelos disponibles y mide cuánto tarda cada uno en decir "hola".
// La clave se lee de la variable de entorno GEMINI_API_KEY (no se guarda ni se imprime).
//
//   PowerShell:  $env:GEMINI_API_KEY = "tu_clave"; node scripts/probar-gemini.mjs
const key = process.env.GEMINI_API_KEY;
if (!key) {
  console.error('Falta GEMINI_API_KEY. En PowerShell: $env:GEMINI_API_KEY = "tu_clave"; node scripts/probar-gemini.mjs');
  process.exit(1);
}

const base = 'https://generativelanguage.googleapis.com/v1beta';
const headers = { 'Content-Type': 'application/json', 'x-goog-api-key': key };

// 1. Modelos que esta clave puede usar para generar texto.
const list = await fetch(`${base}/models?pageSize=200`, { headers });
if (!list.ok) {
  console.error('No pude listar los modelos:', list.status, (await list.text()).slice(0, 300));
  process.exit(1);
}
const all = (await list.json()).models ?? [];
const usable = all.filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent')).map((m) => m.name.replace('models/', ''));
console.log(`\nModelos con generateContent (${usable.length}):`);
console.log(usable.filter((n) => /gemini/.test(n)).join('\n'));

// 2. Prueba rápida de los que usa DESJ, con y sin nivel de pensamiento.
const wanted = ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite', 'gemini-2.5-flash'];
console.log('\nPrueba "hola" (máximo 40 s cada una):');
for (const model of wanted) {
  for (const level of [null, 'LOW']) {
    const body = {
      contents: [{ role: 'user', parts: [{ text: 'Responde solo: hola' }] }],
      generationConfig: { maxOutputTokens: 256, ...(level ? { thinkingConfig: { thinkingLevel: level } } : {}) },
    };
    const t0 = Date.now();
    try {
      const res = await fetch(`${base}/models/${model}:generateContent`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(40_000) });
      const ms = Date.now() - t0;
      const data = await res.json().catch(() => ({}));
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('') ?? data.error?.message?.slice(0, 100) ?? '';
      console.log(`${res.status}  ${String(ms).padStart(6)} ms  ${model}  pensamiento=${level ?? 'por defecto'}  -> ${text.replace(/\s+/g, ' ').slice(0, 80)}`);
    } catch (e) {
      console.log(`ERR  ${String(Date.now() - t0).padStart(6)} ms  ${model}  pensamiento=${level ?? 'por defecto'}  -> ${e.name}`);
    }
  }
}
