/**
 * Um único pool Postgres para o processo.
 * Vários `new Pool()` (default max=10 cada) estouram tilit_postgres (max_connections=100)
 * e o Traefik devolve HTTP 502 no CRM.
 */
import pg from 'pg';
import { config } from './config.js';

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 12,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 8_000,
});
