/**
 * Retencao de patches antigos (F5.4).
 * Arquiva patches com status final > N dias para whatsapp_treinador_patches_arquivo.
 * Remove da tabela principal para manter consultas rapidas.
 */
import pg from 'pg';
import { config } from '../../config.js';
import { garantirTabelaPatchesPendentes } from './treinamento-config-schema.js';
import { pool } from '../../pg-pool.js';


const STATUS_FINAIS = ['aprovado', 'cancelado', 'revertido'];

async function garantirTabelaArquivo(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_treinador_patches_arquivo (
      id INT PRIMARY KEY,
      dados JSONB NOT NULL,
      arquivado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function arquivarPatchesAntigos(dias = 90): Promise<{ arquivados: number }> {
  await garantirTabelaPatchesPendentes(pool);
  await garantirTabelaArquivo();

  const res = await pool.query(
    `SELECT * FROM whatsapp_config_patches_pendentes
     WHERE status = ANY($1::text[])
       AND atualizado_em < NOW() - ($2 || ' days')::interval`,
    [STATUS_FINAIS, String(Math.max(1, dias))],
  );

  let arquivados = 0;
  for (const row of res.rows) {
    await pool.query(
      `INSERT INTO whatsapp_treinador_patches_arquivo (id, dados)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (id) DO UPDATE SET dados = EXCLUDED.dados, arquivado_em = NOW()`,
      [row.id, JSON.stringify(row)],
    );
    await pool.query(`DELETE FROM whatsapp_config_patches_pendentes WHERE id = $1`, [row.id]);
    arquivados += 1;
  }

  if (arquivados) {
    console.log(`[retencao] ${arquivados} patches arquivados (> ${dias} dias)`);
  }
  return { arquivados };
}
