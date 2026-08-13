/**
 * Endpoints de auditoria + conversas XAI (lista/detalhe).
 * Aceita sessão do painel ou x-master-key do Master Admin.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { estaAutenticado } from './auth-minasplaca.js';
import {
  listarAuditoriaPorTelefone,
  listarAuditoriaPorContato,
  listarConversasComAuditoria,
} from './ia-auditoria-store.js';
import { montarJustificativaCamadas } from './ia-justificativa-camadas.js';
import { obterHistorico } from './historico-minasplaca.js';

async function exigirAuth(req: FastifyRequest, reply: FastifyReply) {
  if (!estaAutenticado(req)) {
    reply.code(401).send({ ok: false, erro: 'Nao autenticado' });
    return false;
  }
  return true;
}

function enriquecer(item: Awaited<ReturnType<typeof listarAuditoriaPorTelefone>>[0]) {
  return {
    ...item,
    detalhe: montarJustificativaCamadas(item.camadas, {
      origem: item.origem,
      problemas: item.problemas,
    }),
  };
}

export async function rotasAuditoriaIa(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { telefone: string }; Querystring: { limite?: string } }>(
    '/api/ia/auditoria/:telefone',
    async (req, reply) => {
      if (!(await exigirAuth(req, reply))) return;
      const telefone = String(req.params.telefone || '').trim();
      if (!telefone || telefone.length < 4) {
        return reply.code(400).send({ ok: false, erro: 'telefone invalido' });
      }
      const limite = Number(req.query.limite || 20);
      const itens = (await listarAuditoriaPorTelefone(telefone, limite)).map(enriquecer);
      return { ok: true, telefone, n: itens.length, itens };
    },
  );

  app.get<{ Querystring: { limite?: string } }>('/api/ia/conversas', async (req, reply) => {
    if (!(await exigirAuth(req, reply))) return;
    const limite = Number(req.query.limite || 40);
    const conversas = await listarConversasComAuditoria(limite);
    return { ok: true, n: conversas.length, conversas };
  });

  app.get<{
    Params: { contatoId: string; telefone: string };
    Querystring: { limite?: string };
  }>('/api/ia/conversas/:contatoId/:telefone', async (req, reply) => {
    if (!(await exigirAuth(req, reply))) return;
    const contatoId = decodeURIComponent(String(req.params.contatoId || '').trim());
    const telefone = decodeURIComponent(String(req.params.telefone || '').trim());
    if (!contatoId || !telefone || telefone.length < 4) {
      return reply.code(400).send({ ok: false, erro: 'contato/telefone invalidos' });
    }
    const limite = Number(req.query.limite || 50);
    const auditorias = (await listarAuditoriaPorContato(contatoId, telefone, limite)).map(
      enriquecer,
    );

    let historico: Array<{ role: string; content: string; ts?: number }> = [];
    try {
      const h = await obterHistorico(telefone, Math.min(limite * 2, 100));
      historico = h.map((m) => ({
        role: m.role,
        content: m.content,
        ts: m.timestamp,
      }));
    } catch {
      historico = [];
    }

    type Bolha = {
      id: string;
      role: string;
      content: string;
      created_at?: string;
      origem?: string;
      mensagem_id?: string;
      detalhe?: ReturnType<typeof montarJustificativaCamadas> | null;
      auditoria_id?: number;
    };
    const bolhas: Bolha[] = historico.map((m, idx) => {
      if (m.role !== 'assistant') {
        return {
          id: `h-${idx}`,
          role: m.role,
          content: m.content,
          created_at: m.ts ? new Date(m.ts).toISOString() : undefined,
        };
      }
      const match = auditorias.find(
        (a) =>
          a.mensagem_final === m.content
          || a.mensagem_final.slice(0, 80) === String(m.content || '').slice(0, 80),
      );
      return {
        id: match?.mensagem_id || `h-${idx}`,
        role: 'assistant',
        content: m.content,
        created_at: m.ts ? new Date(m.ts).toISOString() : match?.criado_em,
        origem: match?.origem,
        mensagem_id: match?.mensagem_id,
        detalhe: match?.detalhe || null,
        auditoria_id: match?.id,
      };
    });

    if (!bolhas.length && auditorias.length) {
      for (const a of [...auditorias].reverse()) {
        bolhas.push({
          id: a.mensagem_id || String(a.id),
          role: 'assistant',
          content: a.mensagem_final,
          created_at: a.criado_em,
          origem: a.origem,
          mensagem_id: a.mensagem_id,
          detalhe: a.detalhe,
          auditoria_id: a.id,
        });
      }
    }

    return {
      ok: true,
      contato_id: contatoId,
      telefone,
      n: bolhas.length,
      bolhas,
      auditorias,
    };
  });
}
