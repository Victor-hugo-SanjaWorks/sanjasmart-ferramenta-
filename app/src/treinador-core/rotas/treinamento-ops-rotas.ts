/**
 * Rotas ops do treinador (metricas, audit, inventario, historico) — F5.
 * Motivo: manter treinamento-admin.ts curto e auditable por dominio.
 * Plugin Fastify chamado por registrarRotasTreinamentoAdmin.
 */
import type { FastifyInstance } from 'fastify';

type VerificarAdmin = (req: unknown, reply: unknown) => boolean;

export function registrarRotasTreinamentoOps(
  app: FastifyInstance,
  exigirAdmin: VerificarAdmin,
): void {
  app.get('/api/admin/treinamento/metricas', async (req, reply) => {
    if (!exigirAdmin(req, reply)) return;
    const { obterMetricasTreinador } = await import('../servicos/treinamento-metricas.js');
    const { obterLatenciaP95 } = await import('../servicos/treinamento-latencia.js');
    const { obterMetricasAb } = await import('../servicos/treinamento-ab-prompt.js');
    return {
      patches: await obterMetricasTreinador(),
      latenciaP95Ms: obterLatenciaP95(),
      ab: await obterMetricasAb(),
    };
  });

  app.get('/api/admin/treinamento/audit', async (req, reply) => {
    if (!exigirAdmin(req, reply)) return;
    const { listarAuditRecente } = await import('../servicos/treinamento-audit-log.js');
    return { itens: await listarAuditRecente(50) };
  });

  app.get('/api/admin/treinamento/inventario', async (req, reply) => {
    if (!exigirAdmin(req, reply)) return;
    const { gerarInventarioFrota } = await import('../servicos/treinamento-inventario.js');
    return { itens: await gerarInventarioFrota() };
  });

  app.get<{ Querystring: { telefone?: string } }>(
    '/api/admin/treinamento/historico-autor',
    async (req, reply) => {
      if (!exigirAdmin(req, reply)) return;
      const tel = String(req.query?.telefone || '').trim();
      if (!tel) return reply.status(400).send({ erro: 'telefone obrigatorio' });
      const { listarPatchesDoAutor } = await import('../servicos/treinamento-historico-autor.js');
      return { itens: await listarPatchesDoAutor(tel) };
    },
  );

  app.post<{ Body: { telefone?: string } }>(
    '/api/admin/treinamento/reverter-meu-ultimo',
    async (req, reply) => {
      if (!exigirAdmin(req, reply)) return;
      const tel = String(req.body?.telefone || '').trim();
      if (!tel) return reply.status(400).send({ erro: 'telefone obrigatorio' });
      const { reverterMeuUltimo } = await import('../servicos/treinamento-historico-autor.js');
      return reverterMeuUltimo(tel);
    },
  );

  app.post('/api/admin/treinamento/arquivar-patches', async (req, reply) => {
    if (!exigirAdmin(req, reply)) return;
    const { arquivarPatchesAntigos } = await import(
      '../servicos/treinamento-retencao-patches.js'
    );
    return arquivarPatchesAntigos(90);
  });

  app.get<{ Querystring: { alvo?: string; chave?: string; limite?: string } }>(
    '/api/admin/treinamento/versoes',
    async (req, reply) => {
      if (!exigirAdmin(req, reply)) return;
      const { listarBackupsPromptDashboard } = await import(
        '../servicos/treinamento-versoes-dashboard.js'
      );
      return listarBackupsPromptDashboard({
        alvo: req.query?.alvo,
        chave: req.query?.chave ?? null,
        limite: req.query?.limite ? Number(req.query.limite) : undefined,
      });
    },
  );

  app.post<{ Body: { id?: number; autor?: string } }>(
    '/api/admin/treinamento/versoes/restaurar',
    async (req, reply) => {
      if (!exigirAdmin(req, reply)) return;
      try {
        const { restaurarBackupPromptDashboard } = await import(
          '../servicos/treinamento-versoes-dashboard.js'
        );
        return await restaurarBackupPromptDashboard({
          id: Number(req.body?.id),
          autor: req.body?.autor,
        });
      } catch (error) {
        return reply.status(400).send({
          erro: error instanceof Error ? error.message : 'Falha ao restaurar',
        });
      }
    },
  );
}
