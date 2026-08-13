/**
 * API REST das mídias-gatilho (área Mídias).
 * Autenticação: cookie do painel (hook global do servidor) — espelha conhecimento-rotas.
 */
import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import {
  listarMidiasGatilho,
  salvarMidiaGatilho,
  atualizarMidiaGatilho,
  removerMidiaGatilho,
  obterMidiaPorId,
  caminhoArquivoMidia,
  formatarMencaoTool,
  formatarChipTool,
  formatarBlocoToolGenerico,
  substituirArquivoMidia,
  previewDisparoTool,
  type TipoMidiaGatilho,
} from './midias-gatilho-store.js';
import {
  listarAtivacoesMidia,
  contarAtivacoesPorMidia,
} from './midias-ativacoes-store.js';

export async function rotasMidiasGatilho(app: FastifyInstance): Promise<void> {
  app.get('/api/ia/midias-gatilho', async () => {
    const midias = await listarMidiasGatilho();
    const contagens = await contarAtivacoesPorMidia().catch(
      () => ({}) as Awaited<ReturnType<typeof contarAtivacoesPorMidia>>,
    );
    return {
      ok: true,
      midias: midias.map((m) => ({
        ...m,
        ativacoes: contagens[m.id]?.total || 0,
        ultima_justificativa: contagens[m.id]?.ultima_justificativa || '',
        ultima_ativacao_em: contagens[m.id]?.ultima_em || '',
      })),
    };
  });

  app.get('/api/ia/midias-gatilho/ativacoes', async (req) => {
    const q = (req.query ?? {}) as { midia_id?: string; limite?: string };
    const ativacoes = await listarAtivacoesMidia({
      midia_id: q.midia_id,
      limite: q.limite ? Number(q.limite) : 80,
    });
    return { ok: true, ativacoes };
  });

  app.get('/api/ia/midias-gatilho/mencao-template', async () => {
    return {
      ok: true,
      bloco: formatarBlocoToolGenerico(),
      tool: 'enviar_midia_gatilho',
    };
  });

  app.get('/api/ia/midias-gatilho/:id/mencao', async (req, reply) => {
    const id = String((req.params as { id: string }).id || '');
    const midia = await obterMidiaPorId(id);
    if (!midia) {
      return reply.code(404).send({ ok: false, erro: 'Midia nao encontrada' });
    }
    return {
      ok: true,
      mencao: formatarMencaoTool(midia),
      chip: formatarChipTool(midia),
      preview: previewDisparoTool(midia),
      midia: {
        id: midia.id,
        nome: midia.nome,
        prompt_gatilho: midia.prompt_gatilho,
        tipo: midia.tipo,
      },
    };
  });

  app.get('/api/ia/midias-gatilho/:id/arquivo', async (req, reply) => {
    const id = String((req.params as { id: string }).id || '');
    const midia = await obterMidiaPorId(id);
    if (!midia) {
      return reply.code(404).send({ ok: false, erro: 'Midia nao encontrada' });
    }
    const path = caminhoArquivoMidia(midia);
    try {
      await access(path);
    } catch {
      return reply.code(404).send({ ok: false, erro: 'Arquivo nao encontrado' });
    }
    reply.header('Content-Type', midia.mime || 'application/octet-stream');
    reply.header(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(midia.nome || 'arquivo')}"`,
    );
    return reply.send(createReadStream(path));
  });

  app.post('/api/ia/midias-gatilho', async (req, reply) => {
    const body = (req.body ?? {}) as {
      nome?: string;
      prompt_gatilho?: string;
      tipo?: TipoMidiaGatilho;
      mime?: string;
      legenda?: string;
      ativo?: boolean;
      data_url?: string;
      base64?: string;
    };
    try {
      const midia = await salvarMidiaGatilho({
        nome: String(body.nome || 'arquivo'),
        prompt_gatilho: body.prompt_gatilho,
        tipo: body.tipo,
        mime: body.mime,
        legenda: body.legenda,
        ativo: body.ativo,
        data_url: body.data_url,
        base64: body.base64,
      });
      return { ok: true, midia };
    } catch (e) {
      return reply.code(400).send({
        ok: false,
        erro: e instanceof Error ? e.message : String(e),
      });
    }
  });

  app.put('/api/ia/midias-gatilho/:id/arquivo', async (req, reply) => {
    const id = String((req.params as { id: string }).id || '');
    const body = (req.body ?? {}) as {
      nome?: string;
      prompt_gatilho?: string;
      tipo?: TipoMidiaGatilho;
      mime?: string;
      legenda?: string;
      ativo?: boolean;
      data_url?: string;
      base64?: string;
    };
    try {
      const midia = await substituirArquivoMidia(id, {
        nome: body.nome,
        prompt_gatilho: body.prompt_gatilho,
        tipo: body.tipo,
        mime: body.mime,
        legenda: body.legenda,
        ativo: body.ativo,
        data_url: body.data_url,
        base64: body.base64,
      });
      return { ok: true, midia };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const code = /nao encontrada/i.test(msg) ? 404 : 400;
      return reply.code(code).send({ ok: false, erro: msg });
    }
  });

  app.patch('/api/ia/midias-gatilho/:id', async (req, reply) => {
    const id = String((req.params as { id: string }).id || '');
    const body = (req.body ?? {}) as {
      nome?: string;
      prompt_gatilho?: string;
      tipo?: TipoMidiaGatilho;
      legenda?: string;
      ativo?: boolean;
    };
    try {
      if (body.prompt_gatilho != null && !String(body.prompt_gatilho).trim()) {
        return reply.code(400).send({
          ok: false,
          erro: 'Informe o prompt gatilho (quando a IA deve disparar esta midia)',
        });
      }
      const midia = await atualizarMidiaGatilho(id, body);
      return { ok: true, midia };
    } catch (e) {
      return reply.code(400).send({
        ok: false,
        erro: e instanceof Error ? e.message : String(e),
      });
    }
  });

  app.delete('/api/ia/midias-gatilho/:id', async (req, reply) => {
    const id = String((req.params as { id: string }).id || '');
    try {
      await removerMidiaGatilho(id);
      return { ok: true };
    } catch (e) {
      return reply.code(400).send({
        ok: false,
        erro: e instanceof Error ? e.message : String(e),
      });
    }
  });
}
