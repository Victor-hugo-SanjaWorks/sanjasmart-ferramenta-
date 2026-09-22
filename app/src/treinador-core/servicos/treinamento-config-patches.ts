/**
 * Persistencia e ciclo de vida dos patches pendentes do treinador.
 * Cria proposta via montarPropostaPatchCompleta; aprova com lock + snapshots F4.7.
 * Reversoes ficam em treinamento-config-reverter.ts.
 */
import pg from 'pg';
import { config } from '../../config.js';
import { type TrechoTreinamentoRelacionado } from './treinamento-config-busca.js';
import {
  type AlvoPatchTreinamento,
  type OperacaoPatchTreinamento,
  type PatchTreinamentoAplicavel,
} from './treinamento-config-alvos.js';
import {
  aplicarLotePatchesTreinamento,
  type PreviewPatchTreinamento,
} from './treinamento-config-lote.js';
import {
  normalizarOperacoes,
  parseLista,
  telefoneSeguro,
} from './treinamento-config-patch-utils.js';
import { garantirTabelaPatchesPendentes } from './treinamento-config-schema.js';
import { verificarLockOtimista } from './treinamento-lock-otimista.js';
import { montarPropostaPatchCompleta } from './treinamento-config-montar-proposta.js';
import type { CriticaPatch } from '../agent/criticar-patch.js';
import { gravarSnapshotsAposApply } from './treinamento-versoes-store.js';
import { reindexarCatalogoTreinadorForcado } from './treinamento-config-vetorial.js';
import { dispararAlertaRegressaoAposApply } from './treinamento-alerta-regressao.js';
import { registrarAuditAsync } from './treinamento-audit-log.js';
import { invalidarCacheCatalogo } from './treinamento-catalogo-cache.js';
import { pool } from '../../pg-pool.js';


export interface PatchConfiguracaoPendente {
  id: number;
  canal: string;
  telefone_autor: string;
  nome_autor: string | null;
  alvo: AlvoPatchTreinamento;
  chave_alvo: string | null;
  operacao: OperacaoPatchTreinamento;
  trecho_atual: string | null;
  texto_proposto: string;
  resumo: string;
  justificativa: string | null;
  pergunta_confirmacao: string | null;
  preview_antes: string;
  preview_depois: string;
  origem_texto: string;
  status: 'pendente' | 'aprovado' | 'cancelado' | 'revertido';
  confirmado_por: string | null;
  operacoes_json: PatchTreinamentoAplicavel[];
  trechos_relacionados_json: TrechoTreinamentoRelacionado[];
  previews_json: PreviewPatchTreinamento[];
  resposta_treinador: string | null;
  criado_em: string;
  atualizado_em: string;
}

function normalizarPatchPendente(row: PatchConfiguracaoPendente): PatchConfiguracaoPendente {
  return {
    ...row,
    operacoes_json: normalizarOperacoes(row.operacoes_json),
    trechos_relacionados_json: parseLista<TrechoTreinamentoRelacionado>(
      row.trechos_relacionados_json,
    ),
    previews_json: parseLista<PreviewPatchTreinamento>(row.previews_json),
    resposta_treinador: row.resposta_treinador ? String(row.resposta_treinador) : null,
  };
}

export function normalizarPatchPendenteExport(
  row: PatchConfiguracaoPendente,
): PatchConfiguracaoPendente {
  return normalizarPatchPendente(row);
}

export async function inicializarTreinamentoConfigPatches(): Promise<void> {
  await garantirTabelaPatchesPendentes(pool);
}

export async function criarPropostaPatchConfiguracao(opts: {
  texto: string;
  telefoneAutor?: string;
  nomeAutor?: string;
  canal?: 'whatsapp' | 'dashboard';
  modoBusca?: string;
  queryBusca?: string;
  limiteBusca?: number;
}): Promise<PatchConfiguracaoPendente & { critica?: CriticaPatch }> {
  await inicializarTreinamentoConfigPatches();
  const montada = await montarPropostaPatchCompleta({
    texto: opts.texto,
    modoBusca: opts.modoBusca,
    queryBusca: opts.queryBusca,
    limiteBusca: opts.limiteBusca,
  });
  const primeira = montada.operacoes[0];
  const res = await pool.query<PatchConfiguracaoPendente>(
    `INSERT INTO whatsapp_config_patches_pendentes (
      canal, telefone_autor, nome_autor, alvo, chave_alvo, operacao, trecho_atual,
      texto_proposto, resumo, justificativa, pergunta_confirmacao, preview_antes,
      preview_depois, origem_texto, operacoes_json, trechos_relacionados_json,
      previews_json, resposta_treinador, status, atualizado_em
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16::jsonb,$17::jsonb,$18,'pendente',NOW())
    RETURNING *`,
    [
      opts.canal || 'whatsapp',
      telefoneSeguro(opts.telefoneAutor),
      opts.nomeAutor?.trim() || null,
      primeira.alvo,
      primeira.chave || null,
      primeira.operacao,
      primeira.trechoAtual || null,
      primeira.textoProposto,
      montada.resumo,
      montada.justificativa || null,
      montada.perguntaConfirmacao || null,
      montada.previewAntes,
      montada.previewDepois,
      opts.texto.trim(),
      JSON.stringify(montada.operacoes),
      JSON.stringify(montada.trechos),
      JSON.stringify(montada.previews),
      montada.respostaTreinador,
    ],
  );
  const item = normalizarPatchPendente(res.rows[0]) as PatchConfiguracaoPendente & {
    critica?: CriticaPatch;
  };
  item.resposta_treinador = montada.respostaTreinador.replace(
    /Posso confirmar/,
    item.id ? `Proposta #${item.id}. Posso confirmar` : 'Posso confirmar',
  );
  item.critica = montada.critica;
  registrarAuditAsync({
    acao: 'criar_proposta',
    telefone: telefoneSeguro(opts.telefoneAutor),
    intencao: opts.texto.trim().slice(0, 500),
    resultado: `patch #${item.id} pendente`,
    meta: { alvo: primeira.alvo, resumo: montada.resumo },
  });
  return item;
}

export async function listarPatchesConfiguracaoPendentes(): Promise<PatchConfiguracaoPendente[]> {
  await inicializarTreinamentoConfigPatches();
  const res = await pool.query<PatchConfiguracaoPendente>(
    'SELECT * FROM whatsapp_config_patches_pendentes ORDER BY criado_em DESC, id DESC LIMIT 80',
  );
  return res.rows.map(normalizarPatchPendente);
}

export async function obterUltimoPatchPendentePorTelefone(
  telefone: string,
): Promise<PatchConfiguracaoPendente | null> {
  await inicializarTreinamentoConfigPatches();
  const res = await pool.query<PatchConfiguracaoPendente>(
    `SELECT * FROM whatsapp_config_patches_pendentes
     WHERE telefone_autor = $1 AND status = 'pendente'
     ORDER BY criado_em DESC, id DESC LIMIT 1`,
    [telefoneSeguro(telefone)],
  );
  return res.rows[0] ? normalizarPatchPendente(res.rows[0]) : null;
}

export async function obterPatchPendentePorId(
  id: number,
): Promise<PatchConfiguracaoPendente | null> {
  await inicializarTreinamentoConfigPatches();
  const res = await pool.query<PatchConfiguracaoPendente>(
    'SELECT * FROM whatsapp_config_patches_pendentes WHERE id = $1 LIMIT 1',
    [id],
  );
  return res.rows[0] ? normalizarPatchPendente(res.rows[0]) : null;
}

function opsAplicaveis(patch: PatchConfiguracaoPendente): PatchTreinamentoAplicavel[] {
  if (patch.operacoes_json.length) return patch.operacoes_json;
  return [
    {
      alvo: patch.alvo,
      chave: patch.chave_alvo,
      operacao: patch.operacao,
      trechoAtual: patch.trecho_atual,
      textoProposto: patch.texto_proposto,
    },
  ];
}

export async function aprovarPatchConfiguracao(id: number, confirmadoPor: string) {
  const patch = await obterPatchPendentePorId(id);
  if (!patch) throw new Error('Patch pendente nao encontrado');
  if (patch.status !== 'pendente') throw new Error('O patch ja foi encerrado');

  if (patch.previews_json?.length) {
    const lock = await verificarLockOtimista(patch.previews_json);
    if (!lock.ok) {
      throw new Error(
        'Alvo mudou desde a proposta (outro admin ou edicao paralela). ' +
          'Refaca a proposta. Detalhe: ' +
          lock.conflitos.join('; '),
      );
    }
  }

  await aplicarLotePatchesTreinamento(
    opsAplicaveis(patch),
    `treinador_patch:${confirmadoPor}`,
  );

  const previews =
    patch.previews_json?.length > 0
      ? patch.previews_json
      : [
          {
            alvo: patch.alvo,
            chave: patch.chave_alvo,
            antes: patch.preview_antes,
            depois: patch.preview_depois,
          },
        ];
  try {
    await gravarSnapshotsAposApply({
      patchId: id,
      previews,
      criadoPor: confirmadoPor,
    });
  } catch (err) {
    console.error('[treinador] falha ao gravar versoes (apply ok):', err);
  }

  try {
    const rx = await reindexarCatalogoTreinadorForcado();
    if (!rx.ok) {
      console.warn('[treinador] reindex Qdrant apos apply:', rx.motivo || rx);
    }
  } catch (err) {
    console.error('[treinador] reindex Qdrant falhou (apply ok):', err);
  }

  await pool.query(
    `UPDATE whatsapp_config_patches_pendentes
     SET status = 'aprovado', confirmado_por = $2, atualizado_em = NOW()
     WHERE id = $1`,
    [id, confirmadoPor],
  );

  invalidarCacheCatalogo();
  registrarAuditAsync({
    acao: 'aplicar_patch',
    telefone: confirmadoPor,
    intencao: patch.origem_texto?.slice(0, 500) || null,
    resultado: `patch #${id} aprovado`,
    meta: { resumo: patch.resumo },
  });
  dispararAlertaRegressaoAposApply({
    patchId: id,
    previews,
    pedido: patch.origem_texto,
  });
}

export async function cancelarPatchConfiguracao(id: number, confirmadoPor: string) {
  const patch = await obterPatchPendentePorId(id);
  if (!patch) throw new Error('Patch pendente nao encontrado');
  if (patch.status !== 'pendente') throw new Error('O patch ja foi encerrado');
  await pool.query(
    `UPDATE whatsapp_config_patches_pendentes
     SET status = 'cancelado', confirmado_por = $2, atualizado_em = NOW()
     WHERE id = $1`,
    [id, confirmadoPor],
  );
  registrarAuditAsync({
    acao: 'cancelar_patch',
    telefone: confirmadoPor,
    intencao: patch.origem_texto?.slice(0, 500) || null,
    resultado: `patch #${id} cancelado`,
  });
}
