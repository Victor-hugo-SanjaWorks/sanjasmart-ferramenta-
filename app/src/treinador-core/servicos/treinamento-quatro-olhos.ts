/**
 * Quatro olhos (F6.3) — OFF por padrao para nao travar o WhatsApp.
 * Ative so com TREINADOR_QUATRO_OLHOS=1 se a empresa exigir 2 aprovadores.
 * Confirmacao na conversa ja cobre o caso comum.
 */
import pg from 'pg';
import { config } from '../../config.js';
import { telefoneSeguro } from './treinamento-config-patch-utils.js';
import { eReplaceTotalPromptSistema } from './treinamento-confirmacao.js';
import type { PatchTreinamentoAplicavel } from './treinamento-config-alvos.js';
import type { PreviewPatchTreinamento } from './treinamento-config-lote.js';
import { pool } from '../../pg-pool.js';


export function quatroOlhosAtivo(): boolean {
  const v = String(process.env.TREINADOR_QUATRO_OLHOS || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'sim' || v === 'on';
}

async function garantirTabela(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_treinador_aprovacoes_patch (
      id SERIAL PRIMARY KEY,
      patch_id INT NOT NULL,
      telefone TEXT NOT NULL,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (patch_id, telefone)
    )
  `);
}

export function patchExigeQuatroOlhos(
  operacoes: PatchTreinamentoAplicavel[],
  previews?: PreviewPatchTreinamento[],
): boolean {
  if (!quatroOlhosAtivo()) return false;
  return eReplaceTotalPromptSistema(operacoes, previews);
}

export async function registrarAprovacao(
  patchId: number,
  telefone: string,
): Promise<{ total: number }> {
  await garantirTabela();
  const tel = telefoneSeguro(telefone);
  await pool.query(
    `INSERT INTO whatsapp_treinador_aprovacoes_patch (patch_id, telefone)
     VALUES ($1,$2) ON CONFLICT DO NOTHING`,
    [patchId, tel],
  );
  const res = await pool.query<{ n: string }>(
    `SELECT COUNT(DISTINCT telefone)::text AS n
     FROM whatsapp_treinador_aprovacoes_patch WHERE patch_id = $1`,
    [patchId],
  );
  return { total: Number(res.rows[0]?.n || 0) };
}

export async function temDuasAprovacoes(patchId: number): Promise<boolean> {
  await garantirTabela();
  const res = await pool.query<{ n: string }>(
    `SELECT COUNT(DISTINCT telefone)::text AS n
     FROM whatsapp_treinador_aprovacoes_patch WHERE patch_id = $1`,
    [patchId],
  );
  return Number(res.rows[0]?.n || 0) >= 2;
}

export async function checarQuatroOlhos(opts: {
  patchId: number;
  telefone: string;
  operacoes: PatchTreinamentoAplicavel[];
  previews?: PreviewPatchTreinamento[];
}): Promise<{ ok: boolean; faltam: number; mensagem?: string }> {
  if (!patchExigeQuatroOlhos(opts.operacoes, opts.previews)) {
    return { ok: true, faltam: 0 };
  }

  await registrarAprovacao(opts.patchId, opts.telefone);
  const duas = await temDuasAprovacoes(opts.patchId);
  if (duas) return { ok: true, faltam: 0 };

  const res = await pool.query<{ n: string }>(
    `SELECT COUNT(DISTINCT telefone)::text AS n
     FROM whatsapp_treinador_aprovacoes_patch WHERE patch_id = $1`,
    [opts.patchId],
  );
  const total = Number(res.rows[0]?.n || 0);
  return {
    ok: false,
    faltam: 2 - total,
    mensagem:
      `Essa mudanca e grande e esta empresa pediu dois confirmadores. ` +
      `Ja registrei o seu ok (${total}/2). Peça a outra pessoa autorizada confirmar na conversa.`,
  };
}

export async function limparAprovacoesPatch(patchId: number): Promise<void> {
  await garantirTabela();
  await pool.query(`DELETE FROM whatsapp_treinador_aprovacoes_patch WHERE patch_id = $1`, [
    patchId,
  ]);
}
