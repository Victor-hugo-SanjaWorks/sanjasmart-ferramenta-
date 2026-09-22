/**
 * Auditoria de mudancas de config do treinador (prompt/aprendizados).
 * Tabela propria para rastrear quem mudou o que via WhatsApp/admin.
 */
import pg from 'pg';
import { config } from '../../config.js';
import { pool } from '../../pg-pool.js';


let ok = false;

async function garantir(): Promise<void> {
  if (ok) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS configuracao_historico (
      id BIGSERIAL PRIMARY KEY,
      chave TEXT NOT NULL,
      origem TEXT NOT NULL DEFAULT 'sistema',
      antes TEXT,
      depois TEXT,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  ok = true;
}

export async function registrarHistoricoConfiguracao(opts: {
  chave: string;
  origem: string;
  antes: string;
  depois: string;
}): Promise<void> {
  if ((opts.antes ?? null) === (opts.depois ?? null)) return;
  await garantir();
  await pool.query(
    `INSERT INTO configuracao_historico (chave, origem, antes, depois)
     VALUES ($1, $2, $3, $4)`,
    [opts.chave, opts.origem || 'sistema', opts.antes, opts.depois],
  );
}
