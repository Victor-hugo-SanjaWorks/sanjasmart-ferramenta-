export { pool as poolWhatsappTreinador } from '../../pg-pool.js';
import { pool as poolWhatsappTreinador } from '../../pg-pool.js';
/**
 * Pool Postgres e DDL compartilhados do treinamento WhatsApp.
 * Centraliza tabelas de telefones, aprendizados e pendencias.
 * Evita duplicar conexao entre telefones.ts e aprendizados.ts.
 */
import pg from 'pg';
import { config } from '../../config.js';


export function paraBoolean(valor: unknown): boolean {
  return valor === true || valor === 'true' || valor === 1;
}

export async function inicializarTreinamentoWhatsapp(): Promise<void> {
  await poolWhatsappTreinador.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_telefones_treinadores (
      id SERIAL PRIMARY KEY,
      telefone TEXT NOT NULL UNIQUE,
      nome TEXT,
      cargo TEXT,
      observacoes TEXT,
      ativo BOOLEAN NOT NULL DEFAULT TRUE,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await poolWhatsappTreinador.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_aprendizados (
      id SERIAL PRIMARY KEY,
      telefone_autor TEXT NOT NULL,
      nome_autor TEXT,
      instrucao TEXT NOT NULL,
      resumo TEXT,
      origem_texto TEXT NOT NULL,
      ativo BOOLEAN NOT NULL DEFAULT TRUE,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await poolWhatsappTreinador.query(`
    CREATE INDEX IF NOT EXISTS idx_whatsapp_treinadores_telefone
    ON whatsapp_telefones_treinadores (telefone, ativo)
  `);

  await poolWhatsappTreinador.query(`
    CREATE INDEX IF NOT EXISTS idx_whatsapp_aprendizados_ativo
    ON whatsapp_aprendizados (ativo, criado_em DESC)
  `);

  await poolWhatsappTreinador.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_aprendizados_pendentes (
      id SERIAL PRIMARY KEY,
      telefone_autor TEXT NOT NULL,
      nome_autor TEXT,
      instrucao_sugerida TEXT NOT NULL,
      resumo_sugerido TEXT,
      origem_texto TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pendente',
      confirmado_em TIMESTAMPTZ,
      confirmado_por TEXT,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await poolWhatsappTreinador.query(`
    CREATE INDEX IF NOT EXISTS idx_whatsapp_aprendizados_pendentes_status
    ON whatsapp_aprendizados_pendentes (status, criado_em DESC)
  `);
}
