/**
 * Orquestra criar proposta: busca → sugestao LLM → critica → teste automatico.
 * Mantem treinamento-config-patches.ts focado em CRUD/persistencia.
 * Inclui semantica, aviso de embeddings e verificacao de comportamento.
 */
import type { TrechoTreinamentoRelacionado } from './treinamento-config-busca.js';
import type { PatchTreinamentoAplicavel } from './treinamento-config-alvos.js';
import {
  simularLotePatchesTreinamento,
  type PreviewPatchTreinamento,
} from './treinamento-config-lote.js';
import {
  montarRespostaHumanaPatch,
  montarResumoPreviewTexto,
} from './treinamento-config-resposta.js';
import { cortar } from './treinamento-config-patch-utils.js';
import { sugerirPatchPorTexto } from './treinamento-config-sugerir.js';
import { criticarPatchSemanticamente } from './treinamento-critica-semantica.js';
import { verificarComportamentoPatch } from './treinamento-verificar-comportamento.js';
import { criticarOperacoesPatch } from '../agent/criticar-patch.js';
import { buscarContextoTreinador } from '../agent/buscar-contexto.js';
import { validarSchemaOcrDry } from './treinamento-ocr-validar.js';

export type PropostaMontada = {
  operacoes: PatchTreinamentoAplicavel[];
  resumo: string;
  justificativa: string;
  perguntaConfirmacao: string;
  previews: PreviewPatchTreinamento[];
  trechos: TrechoTreinamentoRelacionado[];
  respostaTreinador: string;
  previewAntes: string;
  previewDepois: string;
  critica: ReturnType<typeof criticarOperacoesPatch>;
};

export async function montarPropostaPatchCompleta(opts: {
  texto: string;
  modoBusca?: string;
  queryBusca?: string;
  limiteBusca?: number;
}): Promise<PropostaMontada> {
  const busca = await buscarContextoTreinador({
    query: String(opts.queryBusca || opts.texto).trim(),
    modo: opts.modoBusca || 'auto',
    limite: opts.limiteBusca ?? 8,
  });
  const trechos = busca.trechos;
  const patch = await sugerirPatchPorTexto(opts.texto, trechos);
  const previews = await simularLotePatchesTreinamento(patch.operacoes).catch((error) => {
    throw new Error(error instanceof Error ? error.message : 'Falha ao montar preview do patch');
  });

  for (const prev of previews) {
    if (prev.alvo === 'ocr_documentos_schema') {
      const dry = validarSchemaOcrDry(prev.depois);
      if (!dry.ok) throw new Error(dry.erro);
    }
  }
  const critica = criticarOperacoesPatch({
    pedido: opts.texto,
    operacoes: patch.operacoes,
    previews,
  });

  const semantica = await criticarPatchSemanticamente({
    pedido: opts.texto,
    resumo: patch.resumo,
    previews,
  });
  if (semantica.problemas.length) critica.problemas.push(...semantica.problemas);
  if (semantica.sugestoes.length) critica.sugestoes.push(...semantica.sugestoes);
  if (semantica.contradizPrompt || semantica.risco) {
    critica.aprovadoParaPerguntar = critica.aprovadoParaPerguntar && !semantica.risco;
    critica.nota = Math.max(0, critica.nota - (semantica.risco ? 4 : 2));
    critica.resumo =
      `Critica: nota ${critica.nota}/10. ` +
      (semantica.risco ? 'RISCO. ' : '') +
      (semantica.contradizPrompt ? 'Possivel contradicao. ' : '') +
      (critica.problemas.slice(0, 2).join(' | ') || 'ok');
  }

  let verificacaoResumo = '';
  const previewPrompt =
    previews.find((p) => p.alvo === 'prompt_sistema') || previews[0];
  if (previewPrompt && previewPrompt.antes !== previewPrompt.depois) {
    try {
      const ver = await verificarComportamentoPatch({
        promptAntes: previewPrompt.antes,
        promptDepois: previewPrompt.depois,
        pedido: opts.texto,
      });
      verificacaoResumo = ver.resumo;
      if (!ver.mudouAlgo) {
        critica.sugestoes.push(
          'Teste automatico: respostas iguais antes/depois — revise se o patch tem efeito pratico.',
        );
      }
    } catch {
      /* best-effort */
    }
  }

  const justificativa = [
    patch.justificativa || '',
    `Busca: modo=${busca.modoEfetivo} (pedido=${busca.modoPedido}), trechos=${trechos.length}.`,
    busca.avisoEmbeddings || '',
    critica.resumo,
    verificacaoResumo,
  ]
    .filter(Boolean)
    .join('\n');

  let respostaTreinador = montarRespostaHumanaPatch({
    resumo: patch.resumo,
    justificativa,
    perguntaConfirmacao: patch.perguntaConfirmacao,
    trechos,
    previews,
  });
  if (busca.avisoEmbeddings) respostaTreinador += `\n\n⚠️ ${busca.avisoEmbeddings}`;
  if (verificacaoResumo) respostaTreinador += `\n\n*Teste automatico:* ${verificacaoResumo}`;
  if (!critica.aprovadoParaPerguntar) {
    respostaTreinador +=
      '\n\n⚠️ Critica automatica: esta proposta tem problemas. Revise antes de confirmar.\n' +
      critica.problemas.map((p) => `- ${p}`).join('\n');
  }
  if (critica.exigeConfirmacaoDupla) {
    respostaTreinador +=
      '\n\n⚠️ Isso troca o texto principal inteiro. Se estiver de acordo, responda *sim, pode* ou *pode publicar*.';
  }

  return {
    operacoes: patch.operacoes,
    resumo: patch.resumo,
    justificativa,
    perguntaConfirmacao: patch.perguntaConfirmacao || '',
    previews,
    trechos,
    respostaTreinador,
    previewAntes: cortar(montarResumoPreviewTexto(previews, 'antes')),
    previewDepois: cortar(montarResumoPreviewTexto(previews, 'depois')),
    critica,
  };
}
