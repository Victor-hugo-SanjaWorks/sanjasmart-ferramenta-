/**
 * Deteccao heuristica de idioma PT/EN/ES para classificador (F6.2).
 * Passa hint ao escopo-llm sem quebrar PT-BR como padrao.
 */
export type IdiomaDetectado = 'pt' | 'en' | 'es' | 'desconhecido';

const PT = /\b(voc[eê]|nao|não|obrigad|por favor|quero|mudar|ajust|prompt|saudac)\b/i;
const EN = /\b(please|change|update|prompt|hello|thanks|want|should|always|never)\b/i;
const ES = /\b(por favor|gracias|quiero|cambiar|ajustar|prompt|hola|siempre|nunca)\b/i;

export function detectarIdiomaPedido(texto: string): IdiomaDetectado {
  const t = String(texto || '').trim();
  if (t.length < 4) return 'desconhecido';

  let pt = 0;
  let en = 0;
  let es = 0;
  if (PT.test(t)) pt += 2;
  if (EN.test(t)) en += 2;
  if (ES.test(t)) es += 2;

  const palavras = t.toLowerCase().split(/\s+/);
  for (const p of palavras) {
    if (/^(the|and|with|your|this|that|what|how)$/.test(p)) en += 1;
    if (/^(el|la|los|las|que|como|para|con)$/.test(p)) es += 1;
    if (/^(que|como|para|com|uma|seu|sua)$/.test(p)) pt += 1;
  }

  if (pt >= en && pt >= es && pt > 0) return 'pt';
  if (en > pt && en >= es) return 'en';
  if (es > pt && es >= en) return 'es';
  return 'desconhecido';
}

export function hintIdiomaParaClassificador(idioma: IdiomaDetectado): string {
  if (idioma === 'en') {
    return 'O pedido parece estar em INGLES — classifique pela INTENCAO, responda motivo em PT-BR.';
  }
  if (idioma === 'es') {
    return 'O pedido parece estar em ESPANHOL — classifique pela INTENCAO, responda motivo em PT-BR.';
  }
  return '';
}
