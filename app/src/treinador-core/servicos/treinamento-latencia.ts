/**
 * Latencia p95 do agente treinador (F5.2).
 * Amostras em memoria (+ PG se DATABASE_URL existir).
 * Hook no fim de rodarAgenteTreinador via registrarLatenciaAgente.
 */
import type pg from 'pg';

const MAX_AMOSTRAS = 500;
const amostrasMem: Array<{ app: string; ms: number; em: number }> = [];
let pool: pg.Pool | null = null;

async function getPool(): Promise<pg.Pool | null> {
  if (pool) return pool;
  try {
    const { default: Pg } = await import('pg');
    const { config } = await import('../../config.js');
    if (!config?.databaseUrl) return null;
    pool = new Pg.Pool({ connectionString: config.databaseUrl });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_treinador_latencia (
        id SERIAL PRIMARY KEY,
        app TEXT NOT NULL DEFAULT 'default',
        ms INT NOT NULL,
        em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    return pool;
  } catch {
    return null;
  }
}

function percentil(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

export async function registrarLatenciaAgente(ms: number, app = 'default'): Promise<void> {
  const n = Math.max(0, Math.round(Number(ms) || 0));
  amostrasMem.push({ app, ms: n, em: Date.now() });
  if (amostrasMem.length > MAX_AMOSTRAS) amostrasMem.shift();
  const p = await getPool();
  if (!p) return;
  try {
    await p.query(`INSERT INTO whatsapp_treinador_latencia (app, ms) VALUES ($1,$2)`, [
      app,
      n,
    ]);
  } catch {
    /* telemetria nao pode derrubar o agente */
  }
}

export function obterLatenciaP95(app = 'default'): {
  p95: number;
  amostras: number;
} {
  const vals = amostrasMem.filter((a) => a.app === app).map((a) => a.ms).sort((a, b) => a - b);
  return { p95: percentil(vals, 95), amostras: vals.length };
}
