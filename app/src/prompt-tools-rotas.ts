/**
 * Lista tools + mídias para o autocomplete @ do editor de prompt.
 */
import type { FastifyInstance } from 'fastify';
import { config } from './config.js';
import { listarAtivosParaTool, tokenMidiaTool } from './midias-gatilho-store.js';

const TOOLS_BASE: Array<{ token: string; label: string; tipo: 'tool'; hint: string }> = [
  {
    token: '@tool-enviar_midia_gatilho',
    label: 'enviar_midia_gatilho',
    tipo: 'tool',
    hint: 'Envia mídia cadastrada (vídeo/imagem/áudio)',
  },
  {
    token: '@tool-atualizar_dados_cliente',
    label: 'atualizar_dados_cliente',
    tipo: 'tool',
    hint: 'Salva dados do contato no CRM',
  },
  {
    token: '@tool-transferir_humano',
    label: 'transferir_humano',
    tipo: 'tool',
    hint: 'Passa a conversa para um humano',
  },
  {
    token: '@tool-transferir_departamento',
    label: 'transferir_departamento',
    tipo: 'tool',
    hint: 'Transfere para um departamento',
  },
];

const TOOLS_CAL: Array<{ token: string; label: string; tipo: 'tool'; hint: string }> = [
  {
    token: '@tool-consultar_disponibilidade',
    label: 'consultar_disponibilidade',
    tipo: 'tool',
    hint: 'Consulta horários livres na agenda',
  },
  {
    token: '@tool-marcar_evento',
    label: 'marcar_evento',
    tipo: 'tool',
    hint: 'Agenda a aula experimental',
  },
  {
    token: '@tool-listar_agendas',
    label: 'listar_agendas',
    tipo: 'tool',
    hint: 'Lista agendas disponíveis',
  },
];

export async function rotasPromptTools(app: FastifyInstance): Promise<void> {
  app.get('/api/ia/prompt-tools', async () => {
    const tools = [...TOOLS_BASE];
    if (config.calendarioHabilitado) tools.push(...TOOLS_CAL);

    const midias = await listarAtivosParaTool().catch(() => []);
    const itensMidia = midias.map((m) => ({
      token: tokenMidiaTool(m.nome),
      label: m.nome,
      tipo: 'midia' as const,
      hint: m.prompt_gatilho || m.tipo,
      id: m.id,
    }));

    return { ok: true, itens: [...tools, ...itensMidia] };
  });
}
