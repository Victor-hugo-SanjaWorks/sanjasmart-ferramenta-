/**
 * A/B simples de prompt por telefone (F6.1).
 * Registra variante A/B, conta preferencias/scores e escolhe variante estavel.
 */
import pg from 'pg';
import { config } from '../../config.js';
import { createHash } from 'node:crypto';
import { pool } from '../../pg-pool.js';


async function garantirTabela(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_treinador_ab_prompt (
      id SERIAL PRIMARY KEY,
      telefone TEXT NOT NULL,
      variante TEXT NOT NULL CHECK (variante IN ('A', 'B')),
      score INT NOT NULL DEFAULT 0,
      preferencias INT NOT NULL DEFAULT 0,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (telefone, variante)
    )
  `);
}

function hashTel(t: string): number {
  const h = createHash('md5').update(String(t).replace(/\D/g, '')).digest();
  return h[0] % 2;
}

/** Escolhe variante A ou B de forma deterministica por telefone. */
export function escolherVariante(telefone: string): 'A' | 'B' {
  return hashTel(telefone) === 0 ? 'A' : 'B';
}

export async function registrarResultadoAb(opts: {
  telefone: string;
  variante: 'A' | 'B';
  preferiu?: boolean;
  scoreDelta?: number;
}): Promise<void> {
  await garantirTabela();
  const pref = opts.preferiu ? 1 : 0;
  const score = opts.scoreDelta ?? (opts.preferiu ? 1 : 0);
  await pool.query(
    `INSERT INTO whatsapp_treinador_ab_prompt (telefone, variante, score, preferencias)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (telefone, variante) DO UPDATE SET
       score = whatsapp_treinador_ab_prompt.score + EXCLUDED.score,
       preferencias = whatsapp_treinador_ab_prompt.preferencias + EXCLUDED.preferencias,
       atualizado_em = NOW()`,
    [opts.telefone.replace(/\D/g, ''), opts.variante, score, pref],
  );
}

export async function obterMetricasAb(): Promise<
  Array<{ variante: string; totalScore: number; totalPref: number }>
> {
  await garantirTabela();
  const res = await pool.query(
    `SELECT variante, SUM(score)::int AS total_score, SUM(preferencias)::int AS total_pref
     FROM whatsapp_treinador_ab_prompt GROUP BY variante`,
  );
  return res.rows.map((r) => ({
    variante: r.variante,
    totalScore: r.total_score,
    totalPref: r.total_pref,
  }));
}
