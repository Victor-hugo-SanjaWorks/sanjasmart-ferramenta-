/**
 * Auditoria append-only de intencao+resultado (F5.7).
 * Tabela whatsapp_treinador_audit — hooks em criar/aplicar/cancelar/reverter.
 */
import pg from 'pg';
import { config } from '../../config.js';

const pool = new pg.Pool({ connectionString: config.databaseUrl });

export type AuditEntrada = {
  acao: string;
  telefone?: string | null;
  intencao?: string | null;
  resultado?: string | null;
  meta?: Record<string, unknown> | null;
};

async function garantirTabelaAudit(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_treinador_audit (
      id SERIAL PRIMARY KEY,
      acao TEXT NOT NULL,
      telefone TEXT,
      intencao TEXT,
      resultado TEXT,
      meta JSONB,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_treinador_audit_acao
    ON whatsapp_treinador_audit (acao, criado_em DESC)
  `);
}

export async function registrarAudit(opts: AuditEntrada): Promise<number> {
  await garantirTabelaAudit();
  const res = await pool.query<{ id: number }>(
    `INSERT INTO whatsapp_treinador_audit (acao, telefone, intencao, resultado, meta)
     VALUES ($1,$2,$3,$4,$5::jsonb)
     RETURNING id`,
    [
      opts.acao,
      opts.telefone ?? null,
      opts.intencao ?? null,
      opts.resultado ?? null,
      opts.meta ? JSON.stringify(opts.meta) : null,
    ],
  );
  return res.rows[0]?.id ?? 0;
}

/** Fire-and-forget — nunca bloqueia fluxo principal. */
export function registrarAuditAsync(opts: AuditEntrada): void {
  void registrarAudit(opts).catch((err) => {
    console.error('[audit] falha ao registrar:', err);
  });
}

export async function listarAuditRecente(limite = 50): Promise<
  Array<AuditEntrada & { id: number; criado_em: string }>
> {
  await garantirTabelaAudit();
  const res = await pool.query(
    `SELECT id, acao, telefone, intencao, resultado, meta, criado_em
     FROM whatsapp_treinador_audit
     ORDER BY id DESC LIMIT $1`,
    [Math.min(Math.max(limite, 1), 200)],
  );
  return res.rows;
}
