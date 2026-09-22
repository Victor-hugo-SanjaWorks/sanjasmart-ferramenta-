/**
 * API de leitura do historico de conversa, para o Chatwoot (servidor 117) ou
 * outro sistema puxar mensagens quando precisar.
 *
 * Token proprio (API_MENSAGENS_TOKEN) em vez da chave do Master: quem consulta
 * mensagem nao deve poder administrar o app.
 */
import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import pg from 'pg';
import { config } from './config.js';
import { pool } from './pg-pool.js';


const LIMITE_PADRAO = 100;
const LIMITE_MAX = 500;

type LinhaHistorico = {
  id: number;
  telefone: string;
  role: string;
  content: string;
  timestamp: Date;
};

/** user = quem escreveu para nos; assistant/atendente = o que respondemos. */
function traduzirAutor(role: string): { direcao: 'entrada' | 'saida'; autor: string } {
  if (role === 'user') return { direcao: 'entrada', autor: 'cliente' };
  if (role === 'atendente') return { direcao: 'saida', autor: 'atendente' };
  return { direcao: 'saida', autor: 'ia' };
}

import { estaAutenticado } from './auth-minasplaca.js';

function tokenValido(req: FastifyRequest): boolean {
  if (estaAutenticado(req)) return true;

  const esperado = config.apiMensagensToken || config.adminKey;
  if (!esperado) return false;

  const auth = req.headers.authorization;
  const bearer = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const header = req.headers['x-api-key'] || req.headers['x-minasplaca-key'];
  const queryKey = (req.query as { key?: string })?.key;
  const recebido = bearer || (typeof header === 'string' ? header.trim() : queryKey || '');
  if (!recebido) return false;

  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

function soDigitos(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '');
}

function dataValida(v: unknown): string | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function rotasMensagensApi(app: FastifyInstance): Promise<void> {
  /** Conversas com atividade recente — o consumidor descobre os telefones. */
  app.get('/api/mensagens/conversas', async (req, reply) => {
    if (!tokenValido(req)) return reply.status(401).send({ ok: false, erro: 'token invalido' });

    const q = req.query as { desde?: string; limite?: string };
    const desde = dataValida(q.desde);
    const limite = Math.min(Number(q.limite) || LIMITE_PADRAO, LIMITE_MAX);

    const { rows } = await pool.query<{ telefone: string; ultima: Date; total: string }>(
      `SELECT telefone, MAX(timestamp) AS ultima, COUNT(*) AS total
         FROM historico_conversa
        WHERE ($1::timestamptz IS NULL OR timestamp >= $1)
        GROUP BY telefone
        ORDER BY ultima DESC
        LIMIT $2`,
      [desde, limite],
    );

    return {
      ok: true,
      app: config.appSlug,
      conversas: rows.map((r) => ({
        telefone: r.telefone,
        ultima_em: r.ultima.toISOString(),
        total: Number(r.total),
      })),
    };
  });

  /**
   * Historico de um contato. `depois_de` devolve so o que entrou depois do id
   * informado — e como o consumidor acompanha sem repetir mensagem.
   */
  app.get('/api/mensagens', async (req, reply) => {
    if (!tokenValido(req)) return reply.status(401).send({ ok: false, erro: 'token invalido' });

    const q = req.query as {
      telefone?: string;
      desde?: string;
      ate?: string;
      depois_de?: string;
      limite?: string;
    };

    const telefone = soDigitos(q.telefone);
    if (!telefone) return reply.status(400).send({ ok: false, erro: 'informe telefone' });

    const desde = dataValida(q.desde);
    const ate = dataValida(q.ate);
    const depoisDe = Number(q.depois_de) || null;
    const limite = Math.min(Number(q.limite) || LIMITE_PADRAO, LIMITE_MAX);

    const { rows } = await pool.query<LinhaHistorico>(
      `SELECT id, telefone, role, content, timestamp
         FROM historico_conversa
        WHERE telefone = $1
          AND ($2::timestamptz IS NULL OR timestamp >= $2)
          AND ($3::timestamptz IS NULL OR timestamp <= $3)
          AND ($4::int IS NULL OR id > $4)
        ORDER BY id ASC
        LIMIT $5`,
      [telefone, desde, ate, depoisDe, limite],
    );

    return {
      ok: true,
      app: config.appSlug,
      telefone,
      total: rows.length,
      ultimo_id: rows.length ? rows[rows.length - 1].id : depoisDe,
      mensagens: rows.map((r) => ({
        id: r.id,
        ...traduzirAutor(r.role),
        conteudo: r.content,
        em: r.timestamp.toISOString(),
      })),
    };
  });
}
