/**
 * CRUD de telefones autorizados no modo treinador WhatsApp.
 * Gate de acesso: so numeros cadastrados e ativos editam via chat.
 * Relacionado: treinamento-whatsapp-db.ts, treinamento-whatsapp.ts.
 */
import { normalizarTelefone } from '../../util/telefone.js';
import {
  inicializarTreinamentoWhatsapp,
  paraBoolean,
  poolWhatsappTreinador,
} from './treinamento-whatsapp-db.js';

export interface TelefoneTreinador {
  id: number;
  telefone: string;
  nome: string | null;
  cargo: string | null;
  observacoes: string | null;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

export async function listarTelefonesTreinadores(): Promise<TelefoneTreinador[]> {
  await inicializarTreinamentoWhatsapp();
  const res = await poolWhatsappTreinador.query<TelefoneTreinador>(
    'SELECT * FROM whatsapp_telefones_treinadores ORDER BY ativo DESC, nome NULLS LAST, id DESC',
  );
  return res.rows.map((row) => ({ ...row, ativo: paraBoolean(row.ativo) }));
}

export async function criarTelefoneTreinador(body: {
  telefone: string;
  nome?: string;
  cargo?: string;
  observacoes?: string;
  ativo?: boolean;
}): Promise<TelefoneTreinador> {
  await inicializarTreinamentoWhatsapp();
  const telefone = normalizarTelefone(body.telefone || '');
  if (!telefone || telefone.length < 10) {
    throw new Error('Telefone invalido para treinamento via WhatsApp');
  }
  const res = await poolWhatsappTreinador.query<TelefoneTreinador>(
    `INSERT INTO whatsapp_telefones_treinadores (telefone, nome, cargo, observacoes, ativo, atualizado_em)
     VALUES ($1, $2, $3, $4, $5, NOW())
     RETURNING *`,
    [
      telefone,
      body.nome?.trim() || null,
      body.cargo?.trim() || null,
      body.observacoes?.trim() || null,
      body.ativo ?? true,
    ],
  );
  return { ...res.rows[0], ativo: paraBoolean(res.rows[0].ativo) };
}

export async function atualizarTelefoneTreinador(
  id: number,
  body: { telefone?: string; nome?: string; cargo?: string; observacoes?: string; ativo?: boolean },
): Promise<TelefoneTreinador> {
  await inicializarTreinamentoWhatsapp();
  const atual = await poolWhatsappTreinador.query<TelefoneTreinador>(
    'SELECT * FROM whatsapp_telefones_treinadores WHERE id = $1 LIMIT 1',
    [id],
  );
  if (!atual.rowCount) throw new Error('Telefone treinador nao encontrado');
  const row = atual.rows[0];
  const telefone = body.telefone !== undefined ? normalizarTelefone(body.telefone) : row.telefone;
  if (!telefone || telefone.length < 10) {
    throw new Error('Telefone invalido para treinamento via WhatsApp');
  }
  const res = await poolWhatsappTreinador.query<TelefoneTreinador>(
    `UPDATE whatsapp_telefones_treinadores
     SET telefone = $2,
         nome = $3,
         cargo = $4,
         observacoes = $5,
         ativo = $6,
         atualizado_em = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      telefone,
      body.nome !== undefined ? body.nome.trim() || null : row.nome,
      body.cargo !== undefined ? body.cargo.trim() || null : row.cargo,
      body.observacoes !== undefined ? body.observacoes.trim() || null : row.observacoes,
      body.ativo ?? paraBoolean(row.ativo),
    ],
  );
  return { ...res.rows[0], ativo: paraBoolean(res.rows[0].ativo) };
}

export async function excluirTelefoneTreinador(id: number): Promise<void> {
  await inicializarTreinamentoWhatsapp();
  await poolWhatsappTreinador.query('DELETE FROM whatsapp_telefones_treinadores WHERE id = $1', [id]);
}

export async function telefoneAutorizadoTreinamento(telefone: string): Promise<boolean> {
  await inicializarTreinamentoWhatsapp();
  const numero = normalizarTelefone(telefone);
  if (!numero) return false;
  const res = await poolWhatsappTreinador.query(
    'SELECT 1 FROM whatsapp_telefones_treinadores WHERE telefone = $1 AND ativo = TRUE LIMIT 1',
    [numero],
  );
  return Number(res.rowCount ?? 0) > 0;
}
