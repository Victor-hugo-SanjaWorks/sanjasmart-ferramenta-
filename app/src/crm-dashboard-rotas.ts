/**
 * Rotas da API de Dashboard Comercial / BI.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { obterUsuarioDaSessao } from './auth-minasplaca.js';
import { obterDadosComerciais, salvarMetaComercial } from './crm-dashboard-store.js';

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

  app.put<{ Body: { valor?: number } }>('/api/crm/dashboard-comercial/meta', async (req, reply) => {
    if (!(await exigirAuth(req, reply))) return;
    const valor = Number(req.body?.valor);
    if (!Number.isFinite(valor) || valor <= 0) {
      return reply.code(400).send({ ok: false, erro: 'Informe uma meta maior que zero' });
    }
    await salvarMetaComercial(valor);
    return reply.send({ ok: true });
  });
}
