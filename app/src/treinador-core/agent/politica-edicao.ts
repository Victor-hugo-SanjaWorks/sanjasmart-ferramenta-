/**
 * Politica: quando usar patch (cirurgia) vs aprendizado (overlay no fim do prompt).
 * Evita empilhar gambiarra quando o pedido e edicao de texto/alvo concreto.
 * Usado pela tool decidir_tipo_edicao e pelo system prompt do agente.
 */
import { normalizarTextoPolitica } from './texto-politica.js';
import { avaliarEscopoPedido, type ResultadoEscopo } from './escopo.js';

export type TipoEdicaoTreinador =
  | 'patch_config'
  | 'aprendizado_overlay'
  | 'hibrido'
  | 'pergunta'
  | 'fora_escopo'
  | 'ambiguo';

export type DecisaoTipoEdicao = {
  tipo: TipoEdicaoTreinador;
  motivo: string;
  recomendacao: string;
  escopo: ResultadoEscopo;
};

/**
 * Decide a estrategia de mutacao (nao aplica nada).
 * Patch = alterar texto existente. Aprendizado = regra comportamental global overlay.
 * Aceita escopo ja classificado (ex.: via LLM async) para nao recalcular.
 */
export function decidirTipoEdicao(
  pedido: string,
  escopoOverride?: ResultadoEscopo,
): DecisaoTipoEdicao {
  const escopo = escopoOverride || avaliarEscopoPedido(pedido);
  const t = normalizarTextoPolitica(pedido);

  if (escopo.categoria === 'fora_escopo') {
    return {
      tipo: 'fora_escopo',
      motivo: escopo.motivo,
      recomendacao: escopo.alternativa || 'Recuse e ofereca alternativa em prompt/mensagem.',
      escopo,
    };
  }

  if (escopo.categoria === 'pergunta') {
    return {
      tipo: 'pergunta',
      motivo: 'Pedido informativo — listar alvos/aprendizados, nao mutar.',
      recomendacao: 'Use listar_alvos / listar_aprendizados / ler_alvo_completo e responda.',
      escopo,
    };
  }

  const pedeTextoConcreto =
    /(mensagem|prompt|bloco|trecho|substitu|troc|corrig|reescrev|boas\s*vind|orquestr|ocr_|mensagens_fluxo|prompt_sistema|cri(ar|e)|mont(ar|e)|do\s+zero|saudac)/i.test(
      t,
    );
  const pedeRegraGlobal =
    /(a\s+partir\s+de\s+agora|\bsempre\b|\bnunca\b|quando\s+o\s+usuario|comportamento\s+geral|aprenda)/i.test(
      t,
    );
  const pedeTom =
    /(tom|mais\s+(amigav|agressiv|formal|educad|caloros)|estilo)/i.test(t);

  if (pedeTextoConcreto && pedeRegraGlobal) {
    return {
      tipo: 'hibrido',
      motivo: 'Mistura texto concreto e regra global.',
      recomendacao:
        'Prefira patch nos alvos citados; so use aprendizado se sobrar regra transversal sem texto-alvo.',
      escopo,
    };
  }

  if (pedeTextoConcreto || (pedeTom && /(mensagem|prompt|orquestr)/i.test(t))) {
    return {
      tipo: 'patch_config',
      motivo: 'Ha alvo/texto editavel — cirurgia com patch, nao overlay.',
      recomendacao:
        'ler_alvo_completo(prompt_sistema). Se vazio: propor_patch criando do zero. Se houver texto: buscar_contexto → propor_patch.',
      escopo,
    };
  }

  if (pedeRegraGlobal || escopo.categoria === 'prompt_regras') {
    return {
      tipo: 'aprendizado_overlay',
      motivo: 'Regra comportamental sem alvo de texto claro.',
      recomendacao:
        'propor_aprendizado (overlay). Se a regra conflitar com prompt_sistema, prefira patch depois.',
      escopo,
    };
  }

  if (pedeTom) {
    return {
      tipo: 'patch_config',
      motivo: 'Ajuste de tom costuma viver em orquestracao_texto / mensagens.',
      recomendacao: 'buscar_contexto(modo=vetorial|hibrida) e propor_patch em orquestracao/mensagens.',
      escopo,
    };
  }

  return {
    tipo: escopo.categoria === 'patch_config' ? 'patch_config' : 'ambiguo',
    motivo: escopo.motivo,
    recomendacao:
      escopo.alternativa ||
      'Pergunte: editar texto existente (patch) ou regra global (aprendizado)?',
    escopo,
  };
}

/** Versao async: classifica escopo via LLM (F2.2) e decide o tipo. */
export async function decidirTipoEdicaoAsync(pedido: string): Promise<DecisaoTipoEdicao> {
  const { avaliarEscopoPedidoAsync } = await import('./escopo-llm.js');
  const escopo = await avaliarEscopoPedidoAsync(pedido);
  return decidirTipoEdicao(pedido, escopo);
}
