/**
 * Classificador de escopo com 1 LLM barato + fallback heuristico (F2.2).
 * Substitui o regex cego nos casos de giria, idioma e "sempre" em edicao de texto.
 * Usado pelas tools avaliar_escopo e decidir_tipo_edicao (async).
 */
import { chatCompletionRaw } from '../host/chat-providers.js';
import { extrairJsonObjeto } from '../servicos/treinamento-json-utils.js';
import { avaliarEscopoPedido, type ResultadoEscopo } from './escopo.js';
import { parseEscopoLlmJson, PROMPT_ESCOPO_LLM } from './escopo-llm-parse.js';
import {
  detectarIdiomaPedido,
  hintIdiomaParaClassificador,
} from '../servicos/treinamento-escopo-idioma.js';

export async function avaliarEscopoPedidoAsync(pedido: string): Promise<ResultadoEscopo> {
  const heur = avaliarEscopoPedido(pedido);
  const texto = String(pedido || '').trim();
  if (texto.length < 3) return heur;

  try {
    const idioma = detectarIdiomaPedido(texto);
    const hint = hintIdiomaParaClassificador(idioma);
    const systemContent = hint ? `${PROMPT_ESCOPO_LLM} ${hint}` : PROMPT_ESCOPO_LLM;
    const raw = await chatCompletionRaw(
      [
        { role: 'system', content: systemContent },
        { role: 'user', content: texto.slice(0, 1500) },
      ],
      { temperature: 0, max_tokens: 220 },
    );
    const parsed = extrairJsonObjeto(raw);
    const llm = parseEscopoLlmJson(parsed);
    if (!llm) return { ...heur, motivo: heur.motivo + ' (llm invalido; usei heuristica)' };

    return {
      ...llm,
      motivo: `${llm.motivo} [fonte:llm; heuristica=${heur.categoria}]`,
    };
  } catch {
    return { ...heur, motivo: heur.motivo + ' (llm indisponivel; usei heuristica)' };
  }
}
