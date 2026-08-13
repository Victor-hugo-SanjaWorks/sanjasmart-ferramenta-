/**
 * API REST dos docs de conhecimento na area Prompt.
 * Autenticacao: cookie do painel (hook global do servidor).
 */
import type { FastifyInstance } from 'fastify';
import {
  listarDocsConhecimento,
  salvarDocConhecimento,
  removerDocConhecimento,
} from './conhecimento-store.js';

export async function rotasConhecimento(app: FastifyInstance): Promise<void> {
  app.get('/api/ia/conhecimento', async () => {
    const docs = await listarDocsConhecimento();
    return { ok: true, docs };
  });

  app.post('/api/ia/conhecimento', async (req, reply) => {
    const body = (req.body ?? {}) as {
      nome?: string;
      mime?: string;
      data_url?: string;
      base64?: string;
    };
    try {
      const doc = await salvarDocConhecimento({
        nome: String(body.nome || 'arquivo'),
        mime: body.mime,
        data_url: body.data_url,
        base64: body.base64,
      });
      return { ok: true, doc };
    } catch (e) {
      return reply.code(400).send({
        ok: false,
        erro: e instanceof Error ? e.message : String(e),
      });
    }
  });

  app.delete('/api/ia/conhecimento/:id', async (req, reply) => {
    const id = String((req.params as { id: string }).id || '');
    try {
      await removerDocConhecimento(id);
      return { ok: true };
    } catch (e) {
      return reply.code(400).send({
        ok: false,
        erro: e instanceof Error ? e.message : String(e),
      });
    }
  });
}
