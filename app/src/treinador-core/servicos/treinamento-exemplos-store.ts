/**
 * Persistencia da biblioteca ruim→bom por app (F3.3).
 * Alimenta few-shot no sugerirPatch e recebe casos do "IA errou aqui".
 */
import pg from 'pg';
import { config } from '../../config.js';
import type { ExemploTreino } from './treinamento-exemplos-format.js';
import { formatarExemplosFewShot } from './treinamento-exemplos-format.js';
import { pool } from '../../pg-pool.js';


let ready = false;

export async function garantirTabelaExemplosTreino(): Promise<void> {
  if (ready) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_treinador_exemplos (
      id SERIAL PRIMARY KEY,
      ruim TEXT NOT NULL,
      bom TEXT NOT NULL,
      contexto TEXT,
      tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      ativo BOOLEAN NOT NULL DEFAULT TRUE,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  ready = true;
}

export async function adicionarExemploTreino(ex: ExemploTreino): Promise<ExemploTreino> {
  await garantirTabelaExemplosTreino();
  const ruim = String(ex.ruim || '').trim();
  const bom = String(ex.bom || '').trim();
  if (ruim.length < 3 || bom.length < 3) {
    throw new Error('Exemplo precisa de RUIM e BOM com pelo menos 3 caracteres.');
  }
  const res = await pool.query(
    `INSERT INTO whatsapp_treinador_exemplos (ruim, bom, contexto, tags)
     VALUES ($1,$2,$3,$4::jsonb) RETURNING id, ruim, bom, contexto, tags`,
    [
      ruim,
      bom,
      ex.contexto ? String(ex.contexto).slice(0, 500) : null,
      JSON.stringify(ex.tags || []),
    ],
  );
  const row = res.rows[0];
  return {
    id: row.id,
    ruim: row.ruim,
    bom: row.bom,
    contexto: row.contexto || undefined,
    tags: Array.isArray(row.tags) ? row.tags : [],
  };
}

export async function listarExemplosTreino(limite = 8): Promise<ExemploTreino[]> {
  await garantirTabelaExemplosTreino();
  const res = await pool.query(
    `SELECT id, ruim, bom, contexto, tags FROM whatsapp_treinador_exemplos
     WHERE ativo = TRUE ORDER BY id DESC LIMIT $1`,
    [Math.min(Math.max(Number(limite) || 8, 1), 20)],
  );
  return res.rows.map((row) => ({
    id: row.id,
    ruim: row.ruim,
    bom: row.bom,
    contexto: row.contexto || undefined,
    tags: Array.isArray(row.tags) ? row.tags : [],
  }));
}

export async function montarBlocoFewShotTreino(limite = 5): Promise<string> {
  try {
    const exemplos = await listarExemplosTreino(limite);
    return formatarExemplosFewShot(exemplos, limite);
  } catch {
    return '';
  }
}
