/**
 * Schemas das tools de leitura de alvo (F4.4).
 * Extraido de tool-defs.ts para caber no teto de 300 linhas.
 * Inclui ler_alvo paginado, mapa_secoes e alias ler_alvo_completo.
 */
import type { ToolDefinition } from '../ports/chat-com-tools.js';

const ALVO_ENUM = [
  'prompt_sistema',
  'orquestracao_texto',
  'mensagens_fluxo',
  'ocr_prompt',
  'ocr_prompt_forcado',
  'ocr_documentos_schema',
] as const;

export const TOOLS_LEITURA_ALVO: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'mapa_secoes',
      description:
        'Lista secoes/titulos de um alvo longo (prompt >8k). Use ANTES de ler_alvo para escolher secao ou offset.',
      parameters: {
        type: 'object',
        properties: {
          alvo: { type: 'string', enum: [...ALVO_ENUM] },
          chave: {
            type: 'string',
            description: 'Obrigatorio para orquestracao_texto e mensagens_fluxo',
          },
          max_preview: { type: 'number', description: 'Chars de preview por secao (padrao 120)' },
        },
        required: ['alvo'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ler_alvo',
      description:
        'Le uma FATIA do alvo (paginado). Prefira secao= do mapa_secoes, ou offset+limit. Cap 8000 chars/chamada.',
      parameters: {
        type: 'object',
        properties: {
          alvo: { type: 'string', enum: [...ALVO_ENUM] },
          chave: { type: 'string' },
          offset: { type: 'number', description: 'Inicio em chars (padrao 0)' },
          limit: { type: 'number', description: 'Tamanho da fatia (padrao 4000, max 8000)' },
          secao: {
            type: 'string',
            description: 'Id ou titulo do mapa_secoes (tem prioridade sobre offset)',
          },
        },
        required: ['alvo'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ler_alvo_completo',
      description:
        'Alias de ler_alvo com offset=0 e limit=max_chars (padrao 8000). Para prompts longos use mapa_secoes + ler_alvo.',
      parameters: {
        type: 'object',
        properties: {
          alvo: { type: 'string', enum: [...ALVO_ENUM] },
          chave: { type: 'string' },
          max_chars: { type: 'number', description: 'Padrao 8000, max 8000' },
        },
        required: ['alvo'],
      },
    },
  },
];
