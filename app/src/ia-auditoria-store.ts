/**
 * Persistencia auditavel do pipeline (5 camadas + justificativas).
 * Atendimento e treinador no mesmo schema (origem, contato_id, mensagem_id).
 */
import pg from 'pg';
import { randomUUID } from 'crypto';
import { config } from './config.js';
import type { SaidaCamada } from './agente-schema.js';
import { pool } from './pg-pool.js';


export type OrigemAuditoria = 'atendimento' | 'treinador';

export type LinhaAuditoria = {
  id: number;
  telefone: string;
  mensagem_final: string;
  camadas: SaidaCamada[];
  problemas: string[];
  visao: unknown;
  origem: OrigemAuditoria;
  contato_id: string;
  mensagem_id: string;
  criado_em: string;
};

export async function inicializarBancoAuditoriaIa(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ia_auditoria_mensagem (
      id SERIAL PRIMARY KEY,
      telefone TEXT NOT NULL,
      mensagem_final TEXT NOT NULL,
      camadas JSONB NOT NULL DEFAULT '[]',
      problemas TEXT[] DEFAULT '{}',
      visao JSONB,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_ia_auditoria_tel_em
    ON ia_auditoria_mensagem (telefone, criado_em DESC)
  `);
  await pool.query(`ALTER TABLE ia_auditoria_mensagem ADD COLUMN IF NOT EXISTS visao JSONB`);
  await pool.query(
    `ALTER TABLE ia_auditoria_mensagem ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT 'atendimento'`,
  );
  await pool.query(
    `ALTER TABLE ia_auditoria_mensagem ADD COLUMN IF NOT EXISTS contato_id TEXT`,
  );
  await pool.query(
    `ALTER TABLE ia_auditoria_mensagem ADD COLUMN IF NOT EXISTS mensagem_id TEXT`,
  );
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_ia_auditoria_contato
    ON ia_auditoria_mensagem (contato_id, criado_em DESC)
  `);
}

export async function salvarAuditoriaMensagem(opts: {
  telefone: string;
  mensagemFinal: string;
  camadas: SaidaCamada[];
  problemas?: string[];
  visao?: unknown;
  origem?: OrigemAuditoria;
  contatoId?: string;
  mensagemId?: string;
}): Promise<{ id: number; mensagem_id: string }> {
  const mensagemId = opts.mensagemId || randomUUID();
  const contatoId = opts.contatoId || opts.telefone;
  const origem = opts.origem || 'atendimento';
  const { rows } = await pool.query(
    `INSERT INTO ia_auditoria_mensagem
      (telefone, mensagem_final, camadas, problemas, visao, origem, contato_id, mensagem_id)
     VALUES ($1, $2, $3::jsonb, $4, $5::jsonb, $6, $7, $8)
     RETURNING id`,
    [
      opts.telefone,
      opts.mensagemFinal,
      JSON.stringify(opts.camadas),
      opts.problemas || [],
      opts.visao != null ? JSON.stringify(opts.visao) : null,
      origem,
      contatoId,
      mensagemId,
    ],
  );
  return { id: Number(rows[0].id), mensagem_id: mensagemId };
}

function mapRow(r: Record<string, unknown>): LinhaAuditoria {
  return {
    id: Number(r.id),
    telefone: String(r.telefone),
    mensagem_final: String(r.mensagem_final),
    camadas: (r.camadas as SaidaCamada[]) || [],
    problemas: (r.problemas as string[]) || [],
    visao: r.visao ?? null,
    origem: (r.origem as OrigemAuditoria) || 'atendimento',
    contato_id: String(r.contato_id || r.telefone),
    mensagem_id: String(r.mensagem_id || ''),
    criado_em: String(r.criado_em),
  };
}

export async function listarAuditoriaPorTelefone(
  telefone: string,
  limite = 20,
): Promise<LinhaAuditoria[]> {
  const lim = Math.min(Math.max(Number(limite) || 20, 1), 100);
  const { rows } = await pool.query(
    `SELECT id, telefone, mensagem_final, camadas, problemas, visao,
            COALESCE(origem,'atendimento') AS origem,
            COALESCE(contato_id, telefone) AS contato_id,
            COALESCE(mensagem_id,'') AS mensagem_id,
            criado_em
     FROM ia_auditoria_mensagem
     WHERE telefone = $1
     ORDER BY criado_em DESC
     LIMIT $2`,
    [telefone, lim],
  );
  return rows.map(mapRow);
}

export async function listarAuditoriaPorContato(
  contatoId: string,
  telefone: string,
  limite = 50,
): Promise<LinhaAuditoria[]> {
  const lim = Math.min(Math.max(Number(limite) || 50, 1), 200);
  const { rows } = await pool.query(
    `SELECT id, telefone, mensagem_final, camadas, problemas, visao,
            COALESCE(origem,'atendimento') AS origem,
            COALESCE(contato_id, telefone) AS contato_id,
            COALESCE(mensagem_id,'') AS mensagem_id,
            criado_em
     FROM ia_auditoria_mensagem
     WHERE contato_id = $1 OR telefone = $2
     ORDER BY criado_em DESC
     LIMIT $3`,
    [contatoId, telefone, lim],
  );
  return rows.map(mapRow);
}

/** Lista conversas que têm auditoria (para admin). */
export async function listarConversasComAuditoria(limite = 40): Promise<
  Array<{
    contato_id: string;
    telefone: string;
    ultima_msg: string;
    origem: string;
    atualizado_em: string;
    n: number;
  }>
> {
  const lim = Math.min(Math.max(Number(limite) || 40, 1), 100);
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (COALESCE(contato_id, telefone))
       COALESCE(contato_id, telefone) AS contato_id,
       telefone,
       left(mensagem_final, 160) AS ultima_msg,
       COALESCE(origem,'atendimento') AS origem,
       criado_em AS atualizado_em,
       COUNT(*) OVER (PARTITION BY COALESCE(contato_id, telefone))::int AS n
     FROM ia_auditoria_mensagem
     ORDER BY COALESCE(contato_id, telefone), criado_em DESC
     LIMIT $1`,
    [lim],
  );
  return rows.map((r) => ({
    contato_id: String(r.contato_id),
    telefone: String(r.telefone),
    ultima_msg: String(r.ultima_msg || ''),
    origem: String(r.origem || 'atendimento'),
    atualizado_em: String(r.atualizado_em),
    n: Number(r.n) || 0,
  }));
}
