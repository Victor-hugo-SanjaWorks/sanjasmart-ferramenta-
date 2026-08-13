/**
 * Extrai JSON de respostas de LLM que misturam prosa + bloco.
 * Evita o regex ganancioso que quebra propostas grandes do treinador.
 * Tambem calcula max_tokens dinamico conforme o tamanho do alvo.
 */
export function extrairJsonObjeto(texto: string): Record<string, unknown> {
  const bruto = String(texto || '');
  const inicio = bruto.indexOf('{');
  if (inicio < 0) throw new Error('Resposta sem objeto JSON');

  let profundidade = 0;
  let emString = false;
  let escape = false;
  for (let i = inicio; i < bruto.length; i++) {
    const ch = bruto[i];
    if (emString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === '"') emString = false;
      continue;
    }
    if (ch === '"') {
      emString = true;
      continue;
    }
    if (ch === '{') profundidade += 1;
    if (ch === '}') {
      profundidade -= 1;
      if (profundidade === 0) {
        const fatia = bruto.slice(inicio, i + 1);
        try {
          return JSON.parse(fatia) as Record<string, unknown>;
        } catch {
          // tenta reparo leve: aspas tipograficas e trailing comma
          const reparado = fatia
            .replace(/[“”]/g, '"')
            .replace(/,\s*([}\]])/g, '$1');
          return JSON.parse(reparado) as Record<string, unknown>;
        }
      }
    }
  }
  throw new Error('JSON incompleto ou truncado na resposta do modelo');
}

/** Escala tokens da geracao de patch pelo tamanho do contexto (alvo + pedido). */
export function tokensParaPatch(charsContexto: number): number {
  const n = Math.max(0, Number(charsContexto) || 0);
  if (n < 1500) return 1200;
  if (n < 4000) return 2000;
  if (n < 8000) return 2800;
  return 3600;
}
