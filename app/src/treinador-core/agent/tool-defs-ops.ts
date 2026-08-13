/**
 * Tools operacionais do treinador: eval, A/B, exemplos few-shot e revert local.
 * Nao mutam prompt diretamente — complementam o fluxo de patch/aprendizado.
 * Execucao em tool-runner-ops.ts e tool-runner.ts.
 */
import type { ToolDefinition } from '../ports/chat-com-tools.js';

export const TOOLS_OPS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'listar_exemplos_treino',
      description: 'Lista exemplos ruim→bom deste app (few-shot de treino).',
      parameters: {
        type: 'object',
        properties: { limite: { type: 'number' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'adicionar_exemplo_treino',
      description: 'Salva um par ruim→bom na biblioteca few-shot do app.',
      parameters: {
        type: 'object',
        properties: {
          ruim: { type: 'string' },
          bom: { type: 'string' },
          contexto: { type: 'string' },
        },
        required: ['ruim', 'bom'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reverter_meu_ultimo',
      description:
        'Reverte apenas o ultimo patch APROVADO deste autor (F5.6). Use quando o usuario disser "desfaz o meu ultimo".',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'rodar_checklist_eval',
      description:
        'Roda checklist minima de comportamento no prompt atual ou no preview do patch (F3.5).',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'number', description: 'Patch pendente (usa preview_depois).' },
          prompt: { type: 'string', description: 'Prompt explicito se nao houver patch.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'registrar_ab',
      description:
        'Registra feedback A/B de prompt (F6.1). Use apos o usuario preferir uma variante.',
      parameters: {
        type: 'object',
        properties: {
          variante: { type: 'string', enum: ['A', 'B'] },
          preferiu: { type: 'boolean' },
          score: { type: 'number' },
        },
      },
    },
  },
];
