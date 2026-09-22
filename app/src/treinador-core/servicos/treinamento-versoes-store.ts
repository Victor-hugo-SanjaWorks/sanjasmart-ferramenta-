/**
 * Snapshots versionados de alvos apos cada mudanca (F4.7).
 * Motivo: rollback seguro — guarda os ultimos 3 por alvo/chave (retencao soft).
 * Nunca bloqueia o treinador no WhatsApp; prune e best-effort.
 */
import pg from 'pg';
import { config } from '../../config.js';
import { hashTextoAlvo } from './treinamento-hash.js';
import {
  salvarTextoAtualizado,
  type PreviewPatchTreinamento,
} from './treinamento-config-lote.js';
import type { AlvoPatchTreinamento } from './treinamento-config-alvos.js';
import { reindexarCatalogoTreinadorForcado } from './treinamento-config-vetorial.js';
import { pool } from '../../pg-pool.js';
import {
  MAX_VERSOES_BACKUP,
  podarVersoesAntigas,
} from './treinamento-versoes-retencao.js';


export type VersaoAlvo = {
  id: number;
  alvo: string;
  chave: string | null;
  texto: string;
  hash: string;
  patch_id: number | null;
  versao_anterior_id: number | null;
  origem: string;
  criado_por: string | null;
  criado_em: string;
  chars: number;
};

export async function garantirTabelaVersoes(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_treinador_versoes (
      id SERIAL PRIMARY KEY,
      alvo TEXT NOT NULL,
      chave TEXT,
      texto TEXT NOT NULL,
      hash TEXT NOT NULL,
      patch_id INT,
      versao_anterior_id INT,
      origem TEXT NOT NULL DEFAULT 'apply',
      criado_por TEXT,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_treinador_versoes_alvo
    ON whatsapp_treinador_versoes (alvo, chave, id DESC)
  `);
}

function chaveNorm(chave: string | null | undefined): string | null {
  const c = chave != null ? String(chave).trim() : '';
  return c || null;
}

export async function obterUltimaVersao(
  alvo: string,
  chave?: string | null,
): Promise<VersaoAlvo | null> {
  await garantirTabelaVersoes();
  const res = await pool.query(
    `SELECT *, length(texto) AS chars FROM whatsapp_treinador_versoes
     WHERE alvo = $1 AND ((chave IS NULL AND $2::text IS NULL) OR chave = $2)
     ORDER BY id DESC LIMIT 1`,
    [alvo, chaveNorm(chave)],
  );
  return res.rows[0] || null;
}

export async function gravarVersao(opts: {
  alvo: AlvoPatchTreinamento | string;
  chave?: string | null;
  texto: string;
  patchId?: number | null;
  origem: string;
  criadoPor?: string | null;
  versaoAnteriorId?: number | null;
}): Promise<VersaoAlvo> {
  await garantirTabelaVersoes();
  const texto = String(opts.texto ?? '');
  const hash = hashTextoAlvo(texto);
  const chave = chaveNorm(opts.chave);
  const res = await pool.query(
    `INSERT INTO whatsapp_treinador_versoes
      (alvo, chave, texto, hash, patch_id, versao_anterior_id, origem, criado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *, length(texto) AS chars`,
    [
      opts.alvo,
      chave,
      texto,
      hash,
      opts.patchId ?? null,
      opts.versaoAnteriorId ?? null,
      opts.origem,
      opts.criadoPor ?? null,
    ],
  );
  try {
    await podarVersoesAntigas(String(opts.alvo), chave, MAX_VERSOES_BACKUP);
  } catch (err) {
    console.error('[treinador] prune versoes (nao bloqueia):', err);
  }
  return res.rows[0];
}

/** Na aprovacao: baseline (se 1a vez) + snapshot pos-apply. */
export async function gravarSnapshotsAposApply(opts: {
  patchId: number;
  previews: PreviewPatchTreinamento[];
  criadoPor: string;
}): Promise<VersaoAlvo[]> {
  const out: VersaoAlvo[] = [];
  for (const prev of opts.previews) {
    let anterior = await obterUltimaVersao(prev.alvo, prev.chave);
    if (!anterior) {
      anterior = await gravarVersao({
        alvo: prev.alvo,
        chave: prev.chave,
        texto: prev.antes,
        patchId: null,
        origem: 'baseline',
        criadoPor: opts.criadoPor,
      });
      out.push(anterior);
    }
    const nova = await gravarVersao({
      alvo: prev.alvo,
      chave: prev.chave,
      texto: prev.depois,
      patchId: opts.patchId,
      origem: 'apply',
      criadoPor: opts.criadoPor,
      versaoAnteriorId: anterior.id,
    });
    out.push(nova);
  }
  return out;
}

export async function listarVersoes(opts: {
  alvo: string;
  chave?: string | null;
  limite?: number;
}): Promise<Array<Omit<VersaoAlvo, 'texto'> & { preview: string }>> {
  await garantirTabelaVersoes();
  const lim = Math.min(
    Math.max(Number(opts.limite) || MAX_VERSOES_BACKUP, 1),
    50,
  );
  const res = await pool.query(
    `SELECT id, alvo, chave, hash, patch_id, versao_anterior_id, origem,
            criado_por, criado_em, length(texto) AS chars,
            left(texto, 160) AS preview
     FROM whatsapp_treinador_versoes
     WHERE alvo = $1 AND ((chave IS NULL AND $2::text IS NULL) OR chave = $2)
     ORDER BY id DESC
     LIMIT $3`,
    [opts.alvo, chaveNorm(opts.chave), lim],
  );
  return res.rows;
}

export async function obterVersaoPorId(id: number): Promise<VersaoAlvo | null> {
  await garantirTabelaVersoes();
  const res = await pool.query(
    `SELECT *, length(texto) AS chars FROM whatsapp_treinador_versoes WHERE id = $1`,
    [id],
  );
  return res.rows[0] || null;
}

export async function restaurarVersao(
  id: number,
  confirmadoPor: string,
): Promise<{ versao: VersaoAlvo; nova: VersaoAlvo }> {
  const versao = await obterVersaoPorId(id);
  if (!versao) throw new Error('Nao achei essa versao salva para restaurar');
  const ultima = await obterUltimaVersao(versao.alvo, versao.chave);
  await salvarTextoAtualizado(
    versao.alvo as AlvoPatchTreinamento,
    versao.chave,
    versao.texto,
    `treinador_rollback_v${id}:${confirmadoPor}`,
  );
  const nova = await gravarVersao({
    alvo: versao.alvo,
    chave: versao.chave,
    texto: versao.texto,
    patchId: null,
    origem: `rollback_v${id}`,
    criadoPor: confirmadoPor,
    versaoAnteriorId: ultima?.id ?? null,
  });
  try {
    await reindexarCatalogoTreinadorForcado();
  } catch (err) {
    console.error('[treinador] reindex apos restaurar_versao falhou:', err);
  }
  return { versao, nova };
}

/** Reverte um patch aprovado restaurando a versao_anterior de cada snapshot apply. */
export async function reverterPatchViaVersoes(
  patchId: number,
  confirmadoPor: string,
): Promise<{ restauradas: number[] }> {
  await garantirTabelaVersoes();
  const res = await pool.query(
    `SELECT * FROM whatsapp_treinador_versoes
     WHERE patch_id = $1 AND origem = 'apply'
     ORDER BY id ASC`,
    [patchId],
  );
  if (!res.rows.length) {
    throw new Error(
      'Nao achei backup dessa mudanca. Voce ainda pode pedir para voltar a uma versao anterior listada.',
    );
  }
  const restauradas: number[] = [];
  for (const row of res.rows) {
    const antId = row.versao_anterior_id as number | null;
    if (!antId) continue;
    const r = await restaurarVersao(antId, confirmadoPor);
    restauradas.push(r.versao.id);
  }
  return { restauradas };
}
