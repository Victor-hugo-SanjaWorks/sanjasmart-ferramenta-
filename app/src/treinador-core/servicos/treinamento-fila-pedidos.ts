/**
 * Fila de pedidos do treinador quando o LLM cai (F4.9 / C#25).
 * Motivo: nao perder o que o admin pediu — processa no proximo turno estavel.
 * Persistencia Postgres + espelho em memoria.
 */
import pg from 'pg';
import { config } from '../../config.js';
import { telefoneSeguro } from './treinamento-config-patch-utils.js';

const pool = new pg.Pool({ connectionString: config.databaseUrl });

export type PedidoFilaTreinador = {
  id: number;
  telefone: string;
  canal: string;
  texto: string;
  status: string;
  tentativas: number;
  ultimo_erro: string | null;
  criado_em: string;
};

let schemaOk = false;

export async function garantirTabelaFilaPedidos(): Promise<void> {
  if (schemaOk) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_treinador_fila_pedidos (
      id SERIAL PRIMARY KEY,
      telefone TEXT NOT NULL,
      canal TEXT NOT NULL DEFAULT 'whatsapp',
      texto TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pendente',
      tentativas INT NOT NULL DEFAULT 0,
      ultimo_erro TEXT,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_treinador_fila_tel_status
    ON whatsapp_treinador_fila_pedidos (telefone, status, id ASC)
  `);
  schemaOk = true;
}

export async function enfileirarPedidoTreinador(opts: {
  telefone: string;
  texto: string;
  canal?: string;
  erro?: string;
}): Promise<PedidoFilaTreinador> {
  await garantirTabelaFilaPedidos();
  const texto = String(opts.texto || '').trim().slice(0, 4000);
  if (texto.length < 2) throw new Error('pedido curto demais para enfileirar');
  const res = await pool.query(
    `INSERT INTO whatsapp_treinador_fila_pedidos
      (telefone, canal, texto, status, tentativas, ultimo_erro)
     VALUES ($1,$2,$3,'pendente',0,$4)
     RETURNING *`,
    [
      telefoneSeguro(opts.telefone),
      opts.canal || 'whatsapp',
      texto,
      opts.erro ? String(opts.erro).slice(0, 500) : null,
    ],
  );
  return res.rows[0];
}

export async function obterProximoPedidoFila(
  telefone: string,
): Promise<PedidoFilaTreinador | null> {
  await garantirTabelaFilaPedidos();
  const res = await pool.query(
    `SELECT * FROM whatsapp_treinador_fila_pedidos
     WHERE telefone = $1 AND status = 'pendente'
     ORDER BY id ASC LIMIT 1`,
    [telefoneSeguro(telefone)],
  );
  return res.rows[0] || null;
}

export async function marcarPedidoFila(
  id: number,
  status: 'processado' | 'falhou' | 'pendente',
  erro?: string,
): Promise<void> {
  await garantirTabelaFilaPedidos();
  await pool.query(
    `UPDATE whatsapp_treinador_fila_pedidos
     SET status = $2,
         tentativas = tentativas + CASE WHEN $2 = 'pendente' THEN 1 ELSE 0 END,
         ultimo_erro = COALESCE($3, ultimo_erro),
         atualizado_em = NOW()
     WHERE id = $1`,
    [id, status, erro ? String(erro).slice(0, 500) : null],
  );
}

export async function contarPendentesFila(telefone: string): Promise<number> {
  await garantirTabelaFilaPedidos();
  const res = await pool.query(
    `SELECT COUNT(*)::int AS n FROM whatsapp_treinador_fila_pedidos
     WHERE telefone = $1 AND status = 'pendente'`,
    [telefoneSeguro(telefone)],
  );
  return Number(res.rows[0]?.n || 0);
}
