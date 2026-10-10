/**
 * Rotas da API de Dashboard Comercial / BI.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { obterUsuarioDaSessao } from './auth-minasplaca.js';
import { obterDadosComerciais } from './crm-dashboard-store.js';

async function exigirAuth(req: FastifyRequest, reply: FastifyReply) {
  const u = await obterUsuarioDaSessao(req);
  if (!u) {
    reply.code(401).send({ ok: false, erro: 'Nao autenticado' });
    return null;
  }
  return u;
}

export async function rotasCrmDashboard(app: FastifyInstance): Promise<void> {
  app.get('/api/crm/dashboard-comercial', async (req, reply) => {
    if (!(await exigirAuth(req, reply))) return;
    try {
      const data = await obterDadosComerciais();
      return reply.send({ ok: true, data });
    } catch (err) {
      console.error('[crm-dashboard] Erro ao obter dados comerciais:', err);
      return reply.code(500).send({ ok: false, erro: 'Erro ao consolidar dados comerciais' });
    }
  });
}
