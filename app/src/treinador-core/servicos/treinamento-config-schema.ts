/**
 * Schema da tabela de patches pendentes do treinador.
 * Separado do ciclo de vida (CRUD) para manter arquivos pequenos.
 * Chamado por inicializarTreinamentoConfigPatches.
 */
import type pg from 'pg';

export async function garantirTabelaPatchesPendentes(
  pool: pg.Pool,
): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_config_patches_pendentes (
      id SERIAL PRIMARY KEY,
      canal TEXT NOT NULL DEFAULT 'whatsapp',
      telefone_autor TEXT NOT NULL,
      nome_autor TEXT,
      alvo TEXT NOT NULL,
      chave_alvo TEXT,
      operacao TEXT NOT NULL,
      trecho_atual TEXT,
      texto_proposto TEXT NOT NULL,
      resumo TEXT NOT NULL,
      justificativa TEXT,
      pergunta_confirmacao TEXT,
      preview_antes TEXT NOT NULL,
      preview_depois TEXT NOT NULL,
      origem_texto TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pendente',
      confirmado_por TEXT,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    ALTER TABLE whatsapp_config_patches_pendentes
    ADD COLUMN IF NOT EXISTS operacoes_json JSONB NOT NULL DEFAULT '[]'::jsonb
  `);
  await pool.query(`
    ALTER TABLE whatsapp_config_patches_pendentes
    ADD COLUMN IF NOT EXISTS trechos_relacionados_json JSONB NOT NULL DEFAULT '[]'::jsonb
  `);
  await pool.query(`
    ALTER TABLE whatsapp_config_patches_pendentes
    ADD COLUMN IF NOT EXISTS previews_json JSONB NOT NULL DEFAULT '[]'::jsonb
  `);
  await pool.query(`
    ALTER TABLE whatsapp_config_patches_pendentes
    ADD COLUMN IF NOT EXISTS resposta_treinador TEXT
  `);
}
