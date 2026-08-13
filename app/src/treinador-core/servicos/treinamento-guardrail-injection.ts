/**
 * Detecta tentativa de prompt-injection no texto do treinador.
 * Impede que "ignore tudo / system prompt" vire regra salva no alvo.
 * Usado ao propor patch/aprendizado e na critica.
 */
const PADROES = [
  /ignore\s+(todas?\s+)?(as\s+)?(instru[cç][oõ]es|regras|prompts?)/i,
  /disregard\s+(all\s+)?(previous|prior|above)/i,
  /you\s+are\s+now\s+(dan|jailbreak|unrestricted)/i,
  /(nova|nova\s+)?identidade\s*:\s*/i,
  /system\s*prompt\s*[:=]/i,
  /\[?\s*INST\s*\]?/i,
  /<\/?\s*system\s*>/i,
  /fingir\s+que\s+(voc[eê]|vc)\s+(n[aã]o\s+tem|esqueceu)/i,
  /revela(r)?\s+(seu|o)\s+prompt/i,
  /jailbreak/i,
];

export type ResultadoGuardrail = {
  bloqueado: boolean;
  motivos: string[];
  textoLimpo: string;
};

/** Remove trechos obviamente injeciosos; se o pedido inteiro e so injection, bloqueia. */
export function aplicarGuardrailInjection(texto: string): ResultadoGuardrail {
  const bruto = String(texto || '');
  const motivos: string[] = [];
  let limpo = bruto;

  for (const re of PADROES) {
    if (re.test(bruto)) {
      motivos.push(`padrao injection: ${re.source.slice(0, 40)}`);
      limpo = limpo.replace(re, '[removido]');
    }
  }

  const resto = limpo.replace(/\[removido\]/gi, ' ').replace(/\s+/g, ' ').trim();
  const palavrasUteis = resto.split(' ').filter((w) => w.length > 2);
  // Pedido cujo nucleo era injection (sobrou quase nada util) → bloqueia.
  if (motivos.length && palavrasUteis.length < 3) {
    return {
      bloqueado: true,
      motivos,
      textoLimpo: '',
    };
  }

  return {
    bloqueado: false,
    motivos,
    textoLimpo: limpo.replace(/\[removido\]\s*/gi, '').trim() || bruto.trim(),
  };
}
