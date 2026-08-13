/**
 * Schemas JSON das tools do agente treinador (cerebro com leitura, politica e critica).
 * O LLM escolhe; a execucao fica em tool-runner.ts.
 * Mutacao/ops/leitura/versoes/staging ficam em modulos separados.
 */
import type { ToolDefinition } from '../ports/chat-com-tools.js';
import { TOOLS_LEITURA_ALVO } from './tool-defs-leitura.js';
import { TOOLS_VERSOES } from './tool-defs-versoes.js';
import { TOOLS_STAGING } from './tool-defs-staging.js';
import { TOOLS_MUTACAO } from './tool-defs-mutacao.js';
import { TOOLS_OPS } from './tool-defs-ops.js';

export const TOOLS_TREINADOR: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'avaliar_escopo',
      description:
        'Classifica escopo com LLM barato (fallback heuristico): dentro/fora, patch vs pergunta. Prefira decidir_tipo_edicao para estrategia completa.',
      parameters: {
        type: 'object',
        properties: { pedido: { type: 'string' } },
        required: ['pedido'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'decidir_tipo_edicao',
      description:
        'Decide se o pedido pede patch (cirurgia em texto), aprendizado (overlay), hibrido, pergunta ou fora de escopo. Usa classificador LLM de escopo. Use ANTES de mutar.',
      parameters: {
        type: 'object',
        properties: { pedido: { type: 'string' } },
        required: ['pedido'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'rotear_causa',
      description:
        'OBRIGATORIO cedo em pedidos de mudanca: classifica se a causa e prompt, RAG/conhecimento, codigo/sistema ou config de modelo. Se nao for prompt, NAO proponha patch.',
      parameters: {
        type: 'object',
        properties: { pedido: { type: 'string' } },
        required: ['pedido'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_contexto',
      description: 'Busca trechos editaveis. VOCE escolhe o modo — nao deixe o sistema decidir as cegas.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          modo: {
            type: 'string',
            enum: ['lexical', 'vetorial', 'hibrida', 'auto'],
          },
          limite: { type: 'number' },
        },
        required: ['query', 'modo'],
      },
    },
  },
  ...TOOLS_LEITURA_ALVO,
  {
    type: 'function',
    function: {
      name: 'listar_alvos',
      description: 'Catalogo de alvos editaveis.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'sugerir_chave',
      description:
        'Quando o pedido fala de saudacao/mensagem/horario/formatacao: ranqueia chaves de mensagens_fluxo e orquestracao_texto por similaridade. Use ANTES de propor_patch se houver risco de editar prompt_sistema por engano.',
      parameters: {
        type: 'object',
        properties: {
          pedido: { type: 'string', description: 'Pedido do usuario em linguagem natural' },
          limite: { type: 'number', description: 'Max sugestoes (padrao 5)' },
        },
        required: ['pedido'],
      },
    },
  },
  ...TOOLS_OPS,
  ...TOOLS_MUTACAO,
  ...TOOLS_VERSOES,
  ...TOOLS_STAGING,
];
