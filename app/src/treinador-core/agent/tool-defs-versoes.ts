/**
 * Tools de versionamento de alvo (F4.7).
 * Extraido para nao estourar tool-defs.ts (teto ~300 linhas).
 */
import type { ToolDefinition } from '../ports/chat-com-tools.js';

export const TOOLS_VERSOES: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'listar_versoes',
      description:
        'Lista snapshots versionados de um alvo (mais recentes primeiro). Use antes de restaurar_versao.',
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
          limite: { type: 'number' },
        },
        required: ['alvo'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'restaurar_versao',
      description:
        'Restaura o texto de um snapshot (id de listar_versoes). Cria nova versao rollback.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'number' } },
        required: ['id'],
      },
    },
  },
];
