/**
 * Staging: aplicar preview de patch sem tocar producao (F3.4).
 * Grava snapshots com origem=staging e tabela whatsapp_treinador_staging.
 * Promocao usa salvarTextoAtualizado + fluxo normal de versoes.
 */
import pg from 'pg';
import { config } from '../../config.js';
import {
  gravarVersao,
  obterUltimaVersao,
} from './treinamento-versoes-store.js';
import {
  obterPatchPendentePorId,
  type PatchConfiguracaoPendente,
} from './treinamento-config-patches.js';
import {
  salvarTextoAtualizado,
  simularLotePatchesTreinamento,
  type PreviewPatchTreinamento,
} from './treinamento-config-lote.js';
import type { AlvoPatchTreinamento } from './treinamento-config-alvos.js';
import { reindexarCatalogoTreinadorForcado } from './treinamento-config-vetorial.js';

const pool = new pg.Pool({ connectionString: config.databaseUrl });

export type StagingAlvo = {
  alvo: string;
  chave: string | null;
  texto: string;
  patch_id: number | null;
  autor: string | null;
  criado_em: string;
};

async function garantirTabelaStaging(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_treinador_staging (
      id SERIAL PRIMARY KEY,
      alvo TEXT NOT NULL,
      chave TEXT,
      texto TEXT NOT NULL,
      patch_id INT,
      autor TEXT,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (alvo, chave)
    )
  `);
}

function chaveNorm(chave: string | null | undefined): string | null {
  const c = chave != null ? String(chave).trim() : '';
  return c || null;
}

async function gravarStagingRow(opts: {
  alvo: string;
  chave: string | null;
  texto: string;
  patchId: number;
  autor: string;
}): Promise<void> {
  await garantirTabelaStaging();
  await pool.query(
    `INSERT INTO whatsapp_treinador_staging (alvo, chave, texto, patch_id, autor)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (alvo, chave) DO UPDATE SET
       texto = EXCLUDED.texto,
       patch_id = EXCLUDED.patch_id,
       autor = EXCLUDED.autor,
       criado_em = NOW()`,
    [opts.alvo, opts.chave, opts.texto, opts.patchId, opts.autor],
  );
}

function opsDoPatch(patch: PatchConfiguracaoPendente) {
  if (patch.operacoes_json?.length) return patch.operacoes_json;
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

/** Aplica preview do patch em staging (nao salva producao). */
export async function aplicarEmStaging(
  patchId: number,
  autor: string,
): Promise<{ previews: PreviewPatchTreinamento[] }> {
  const patch = await obterPatchPendentePorId(patchId);
  if (!patch) throw new Error(`Patch #${patchId} nao encontrado`);
  if (patch.status !== 'pendente') {
    throw new Error(`Patch #${patchId} nao esta pendente (status=${patch.status})`);
  }

  const previews =
    patch.previews_json?.length > 0
      ? patch.previews_json
      : await simularLotePatchesTreinamento(opsDoPatch(patch));

  for (const prev of previews) {
    const anterior = await obterUltimaVersao(prev.alvo, prev.chave);
    await gravarVersao({
      alvo: prev.alvo,
      chave: prev.chave,
      texto: prev.depois,
      patchId,
      origem: 'staging',
      criadoPor: autor,
      versaoAnteriorId: anterior?.id ?? null,
    });
    await gravarStagingRow({
      alvo: prev.alvo,
      chave: chaveNorm(prev.chave),
      texto: prev.depois,
      patchId,
      autor,
    });
  }

  return { previews };
}

/** Le texto staging de um alvo (e chave opcional). */
export async function obterStaging(
  alvo: string,
  chave?: string | null,
): Promise<StagingAlvo | null> {
  await garantirTabelaStaging();
  const res = await pool.query(
    `SELECT alvo, chave, texto, patch_id, autor, criado_em
     FROM whatsapp_treinador_staging
     WHERE alvo = $1 AND ((chave IS NULL AND $2::text IS NULL) OR chave = $2)
     LIMIT 1`,
    [alvo, chaveNorm(chave)],
  );
  return res.rows[0] || null;
}

/** Promove staging para producao e limpa a linha staging. */
export async function promoverStagingParaProducao(
  alvo: AlvoPatchTreinamento | string,
  autor: string,
  chave?: string | null,
): Promise<{ ok: true; chars: number }> {
  const row = await obterStaging(String(alvo), chave);
  if (!row) throw new Error(`Nenhum staging para ${alvo}${chave ? '.' + chave : ''}`);

  await salvarTextoAtualizado(
    row.alvo as AlvoPatchTreinamento,
    row.chave,
    row.texto,
    `treinador_staging_promote:${autor}`,
  );

  const ultima = await obterUltimaVersao(row.alvo, row.chave);
  await gravarVersao({
    alvo: row.alvo,
    chave: row.chave,
    texto: row.texto,
    patchId: row.patch_id,
    origem: 'promote_staging',
    criadoPor: autor,
    versaoAnteriorId: ultima?.id ?? null,
  });

  await pool.query(
    `DELETE FROM whatsapp_treinador_staging
     WHERE alvo = $1 AND ((chave IS NULL AND $2::text IS NULL) OR chave = $2)`,
    [row.alvo, chaveNorm(row.chave)],
  );

  try {
    await reindexarCatalogoTreinadorForcado();
  } catch (err) {
    console.error('[staging] reindex apos promote falhou:', err);
  }

  return { ok: true, chars: row.texto.length };
}
