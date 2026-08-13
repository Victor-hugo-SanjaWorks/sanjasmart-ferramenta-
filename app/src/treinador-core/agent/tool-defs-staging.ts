/**
 * Tools de staging F3.4 — testar patch antes de producao.
 * Merge em tool-defs.ts como TOOLS_VERSOES / TOOLS_LEITURA_ALVO.
 */
import type { ToolDefinition } from '../ports/chat-com-tools.js';

export const TOOLS_STAGING: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'aplicar_staging',
      description:
        'Aplica preview de patch pendente em STAGING (nao toca producao). Use para testar antes de aplicar_patch.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'number', description: 'ID do patch pendente' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'promover_staging',
      description:
        'Promove texto staging de um alvo para producao. Requer staging previo via aplicar_staging.',
      parameters: {
        type: 'object',
        properties: {
          alvo: {
            type: 'string',
            enum: [
              'prompt_sistema',
              'orquestracao_texto',
              'mensagens_fluxo',
              'ocr_prompt',
              'ocr_prompt_forcado',
              'ocr_documentos_schema',
            ],
          },
          chave: { type: 'string' },
        },
        required: ['alvo'],
      },
    },
  },
];
