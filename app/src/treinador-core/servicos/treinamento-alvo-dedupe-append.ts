/**
 * Dedupe de append/prepend + aviso de inchaco (F4.5).
 * Motivo: evita colcha de retalhos (regra repetida) e crescimento cego do prompt.
 * Puro — usado em aplicarTextoPatch e criticarOperacoesPatch.
 */

/** Aviso suave quando o alvo passa deste tamanho. */
export const LIMIAR_INCHACO_AVISO = 12_000;
/** Problema forte quando passa deste tamanho apos o patch. */
export const LIMIAR_INCHACO_FORTE = 20_000;

function normalizar(s: string): string {
  return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function palavrasSignificativas(s: string): string[] {
  return normalizar(s)
    .split(' ')
    .filter((p) => p.length > 3);
}

/**
 * True se o texto proposto ja esta contido (normalizado) ou e quase copia
 * de um trecho ja presente no alvo (sobreposicao de palavras >= 0.85).
 */
export function textoPropostoJaExiste(
  textoAtual: string,
  textoProposto: string,
): boolean {
  const atual = normalizar(textoAtual);
  const prop = normalizar(textoProposto);
  if (prop.length < 16 || !atual) return false;
  if (atual.includes(prop)) return true;

  const palavrasProp = palavrasSignificativas(prop);
  if (palavrasProp.length < 4) return false;

  const setAtual = new Set(palavrasSignificativas(atual));
  let hits = 0;
  for (const p of palavrasProp) {
    if (setAtual.has(p)) hits += 1;
  }
  return hits / palavrasProp.length >= 0.85;
}

export type AvisoInchaco = {
  nivel: 'ok' | 'aviso' | 'forte';
  charsAntes: number;
  charsDepois: number;
  mensagem: string | null;
};

export function avaliarInchaco(
  charsAntes: number,
  charsDepois: number,
): AvisoInchaco {
  const antes = Math.max(0, charsAntes);
  const depois = Math.max(0, charsDepois);
  if (depois >= LIMIAR_INCHACO_FORTE) {
    return {
      nivel: 'forte',
      charsAntes: antes,
      charsDepois: depois,
      mensagem:
        `Prompt inchado (${depois} chars). Prefira replace local ou delete de trechos velhos antes de append.`,
    };
  }
  if (depois >= LIMIAR_INCHACO_AVISO) {
    return {
      nivel: 'aviso',
      charsAntes: antes,
      charsDepois: depois,
      mensagem:
        `Alvo passou de ${LIMIAR_INCHACO_AVISO} chars (${depois}). Cuidado com inchaco — considere consolidar regras.`,
    };
  }
  if (antes > 0 && depois > antes * 2 + 800) {
    return {
      nivel: 'aviso',
      charsAntes: antes,
      charsDepois: depois,
      mensagem: `Crescimento grande (${antes}→${depois} chars). Prefira replace cirurgico.`,
    };
  }
  return { nivel: 'ok', charsAntes: antes, charsDepois: depois, mensagem: null };
}
