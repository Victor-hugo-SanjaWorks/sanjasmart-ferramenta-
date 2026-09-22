/**
 * Telemetria agregada de patches do treinador (F5.1).
 * SQL simples sobre whatsapp_config_patches_pendentes — status e taxa de apply.
 */
import pg from 'pg';
import { config } from '../../config.js';
import { garantirTabelaPatchesPendentes } from './treinamento-config-schema.js';
import { pool } from '../../pg-pool.js';


export type MetricasTreinador = {
  propostos: number;
  pendentes: number;
  aprovados: number;
  cancelados: number;
  revertidos: number;
  taxaApply: number;
  total: number;
  atualizadoEm: string;
};

export async function obterMetricasTreinador(): Promise<MetricasTreinador> {
  await garantirTabelaPatchesPendentes(pool);
  const res = await pool.query<{ status: string; n: string }>(
    `SELECT status, COUNT(*)::text AS n
     FROM whatsapp_config_patches_pendentes
     GROUP BY status`,
  );

  const map = new Map(res.rows.map((r) => [r.status, Number(r.n)]));
  const pendentes = map.get('pendente') || 0;
  const aprovados = map.get('aprovado') || 0;
  const cancelados = map.get('cancelado') || 0;
  const revertidos = map.get('revertido') || 0;
  const propostos = pendentes + aprovados + cancelados + revertidos;
  const encerrados = aprovados + cancelados + revertidos;
  const taxaApply = encerrados > 0 ? aprovados / encerrados : 0;

  return {
    propostos,
    pendentes,
    aprovados,
    cancelados,
    revertidos,
    taxaApply: Math.round(taxaApply * 1000) / 1000,
    total: propostos,
    atualizadoEm: new Date().toISOString(),
  };
}
