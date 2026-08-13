/**
 * Rotas admin: cadastrar telefones que treinam a IA pelo WhatsApp.
 * Prefixo /api/treinador/telefones — exige sessão/admin do painel.
 */
import type { FastifyInstance } from 'fastify';
import { obterUsuarioDaSessao } from './auth-minasplaca.js';
import {
  criarTelefoneTreinador,
  excluirTelefoneTreinador,
  listarTelefonesTreinador,
  setTelefoneTreinadorAtivo,
} from './treinador-whatsapp-auth.js';

async function exigirPainel(req: Parameters<typeof obterUsuarioDaSessao>[0]) {
  return obterUsuarioDaSessao(req);
}

export async function rotasTreinadorWhatsapp(app: FastifyInstance): Promise<void> {
  app.get('/api/treinador/telefones', async (req, reply) => {
    if (!(await exigirPainel(req))) {
      return reply.status(401).send({ ok: false, erro: 'Faça login no painel' });
    }
    return { ok: true, telefones: await listarTelefonesTreinador() };
  });

  app.post('/api/treinador/telefones', async (req, reply) => {
    if (!(await exigirPainel(req))) {
      return reply.status(401).send({ ok: false, erro: 'Faça login no painel' });
    }
    const body = (req.body ?? {}) as { telefone?: string; nome?: string };
    try {
      const t = await criarTelefoneTreinador({
        telefone: String(body.telefone || ''),
        nome: body.nome,
      });
      return { ok: true, telefone: t };
    } catch (err) {
      return reply
        .status(400)
        .send({ ok: false, erro: err instanceof Error ? err.message : String(err) });
    }
  });

  app.patch('/api/treinador/telefones/:id', async (req, reply) => {
    if (!(await exigirPainel(req))) {
      return reply.status(401).send({ ok: false, erro: 'Faça login no painel' });
    }
    const id = Number((req.params as { id?: string }).id);
    const body = (req.body ?? {}) as { ativo?: boolean };
    if (!id) return reply.status(400).send({ ok: false, erro: 'id inválido' });
    await setTelefoneTreinadorAtivo(id, body.ativo !== false);
    return { ok: true };
  });

  app.delete('/api/treinador/telefones/:id', async (req, reply) => {
    if (!(await exigirPainel(req))) {
      return reply.status(401).send({ ok: false, erro: 'Faça login no painel' });
    }
    const id = Number((req.params as { id?: string }).id);
    if (!id) return reply.status(400).send({ ok: false, erro: 'id inválido' });
    await excluirTelefoneTreinador(id);
    return { ok: true };
  });
}
