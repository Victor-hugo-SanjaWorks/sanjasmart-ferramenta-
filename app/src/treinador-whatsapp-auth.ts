/**
 * Telefones autorizados a treinar a IA via WhatsApp (frota SanjaWorks).
 * Sem viés de marca — só lista quem pode editar o prompt pelo celular.
 */
import pg from 'pg';
import { config } from './config.js';
import { normalizarTelefone } from './util/telefone.js';
import { pool } from './pg-pool.js';


export type TelefoneTreinador = {
  id: number;
  telefone: string;
  nome: string | null;
  ativo: boolean;
};

export async function inicializarTreinadorWhatsappFrota(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_telefones_treinadores (
      id SERIAL PRIMARY KEY,
      telefone TEXT NOT NULL,
      nome TEXT,
      cargo TEXT,
      observacoes TEXT,
      ativo BOOLEAN NOT NULL DEFAULT TRUE,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_treinadores_tel
    ON whatsapp_telefones_treinadores (telefone)
  `);
}

export async function telefoneAutorizadoTreinador(telefone: string): Promise<boolean> {
  const tel = normalizarTelefone(telefone);
  if (!tel) return false;
  const { rows } = await pool.query(
    `SELECT 1 FROM whatsapp_telefones_treinadores
     WHERE telefone = $1 AND ativo = TRUE LIMIT 1`,
    [tel],
  );
  return rows.length > 0;
}

export async function listarTelefonesTreinador(): Promise<TelefoneTreinador[]> {
  const { rows } = await pool.query(
    `SELECT id, telefone, nome, ativo FROM whatsapp_telefones_treinadores
     ORDER BY ativo DESC, id DESC`,
  );
  return rows.map((r) => ({
    id: Number(r.id),
    telefone: String(r.telefone),
    nome: r.nome ? String(r.nome) : null,
    ativo: Boolean(r.ativo),
  }));
}

export async function criarTelefoneTreinador(dados: {
  telefone: string;
  nome?: string;
}): Promise<TelefoneTreinador> {
  const tel = normalizarTelefone(dados.telefone);
  if (!tel || tel.length < 10) throw new Error('Telefone inválido');
  const { rows } = await pool.query(
    `INSERT INTO whatsapp_telefones_treinadores (telefone, nome, ativo, atualizado_em)
     VALUES ($1, $2, TRUE, NOW())
     ON CONFLICT (telefone) DO UPDATE SET
       nome = COALESCE(EXCLUDED.nome, whatsapp_telefones_treinadores.nome),
       ativo = TRUE,
       atualizado_em = NOW()
     RETURNING id, telefone, nome, ativo`,
    [tel, dados.nome?.trim() || null],
  );
  return {
    id: Number(rows[0].id),
    telefone: String(rows[0].telefone),
    nome: rows[0].nome ? String(rows[0].nome) : null,
    ativo: Boolean(rows[0].ativo),
  };
}

export async function setTelefoneTreinadorAtivo(
  id: number,
  ativo: boolean,
): Promise<void> {
  await pool.query(
    `UPDATE whatsapp_telefones_treinadores
     SET ativo = $2, atualizado_em = NOW() WHERE id = $1`,
    [id, ativo],
  );
}

export async function excluirTelefoneTreinador(id: number): Promise<void> {
  await pool.query(`DELETE FROM whatsapp_telefones_treinadores WHERE id = $1`, [id]);
}
