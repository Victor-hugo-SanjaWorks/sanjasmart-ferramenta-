/**
 * Parser puro do classificador de escopo via LLM (F2.2).
 * Isolado para testar sem chamar modelo; o I/O fica em escopo-llm.ts.
 */
import type { ResultadoEscopo } from './escopo.js';

const CATS = new Set([
  'prompt_regras',
  'patch_config',
  'pergunta',
  'fora_escopo',
  'ambiguo',
]);

/** Normaliza JSON do LLM para ResultadoEscopo; null se invalido. */
export function parseEscopoLlmJson(parsed: Record<string, unknown>): ResultadoEscopo | null {
  const cat = String(parsed.categoria || '');
  if (!CATS.has(cat)) return null;
  const motivo = String(parsed.motivo || '').trim();
  if (!motivo) return null;
  const dentro =
    parsed.dentroDoEscopo === true ||
    (parsed.dentroDoEscopo !== false && cat !== 'fora_escopo' && cat !== 'ambiguo');
  const out: ResultadoEscopo = {
    dentroDoEscopo: cat === 'fora_escopo' ? false : !!dentro,
    categoria: cat as ResultadoEscopo['categoria'],
    motivo,
  };
  if (parsed.alternativa) out.alternativa = String(parsed.alternativa);
  if (cat === 'fora_escopo') out.dentroDoEscopo = false;
  if (cat === 'ambiguo') out.dentroDoEscopo = true;
  return out;
}

export const PROMPT_ESCOPO_LLM =
  'Classifique o pedido de treino de uma IA de atendimento. ' +
  'Responda SOMENTE JSON: {"dentroDoEscopo":bool,"categoria":"patch_config|prompt_regras|pergunta|fora_escopo|ambiguo","motivo":"...","alternativa":"..."}. ' +
  'Regras: (1) editar texto/tom/mensagem/prompt/OCR = patch_config mesmo se disser sempre/nunca; ' +
  '(2) regra global sem alvo de texto = prompt_regras; (3) so pergunta = pergunta; ' +
  '(4) criar integracao/codigo/deploy/API nova = fora_escopo — mas se so quiser MUDAR O TEXTO sobre webhook/integracao, e patch_config; ' +
  '(5) qualquer idioma (EN/ES/PT) — classifique pela INTENCAO, nao por palavras. Motivo curto em PT-BR.';
