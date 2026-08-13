/**
 * Tools de mutacao: patch cirurgico e overlay de aprendizado WhatsApp.
 * Separadas do nucleo de leitura/busca para manter tool-defs.ts enxuto.
 * Execucao em tool-runner-mutacao.ts e tool-runner.ts.
 */
import type { ToolDefinition } from '../ports/chat-com-tools.js';

export const TOOLS_MUTACAO: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'listar_aprendizados',
      description: 'Regras overlay ativas (whatsapp_aprendizados).',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propor_patch',
      description:
        'Gera patch com preview a partir de uma instrucao em linguagem natural. O parametro "texto" e OBRIGATORIO e descreve a mudanca desejada. NAO aplica.',
      parameters: {
        type: 'object',
        properties: {
          texto: {
            type: 'string',
            description:
              'OBRIGATORIO (min 5 caracteres). Instrucao em linguagem natural do que mudar ou CRIAR. Ex: "deixe a saudacao inicial mais calorosa e acolhedora" ou "crie um prompt do zero para atendimento cordial". Nunca deixe vazio.',
          },
          modo_busca: {
            type: 'string',
            enum: ['lexical', 'vetorial', 'hibrida', 'auto'],
          },
          query_busca: { type: 'string' },
          limite_busca: { type: 'number' },
        },
        required: ['texto'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'criticar_patch',
      description:
        'Revisa a ultima sugestao pendente do autor (ou a indicada) antes de pedir confirmacao. Nunca cite numero interno ao usuario.',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'number',
            description: 'Opcional interno. Se omitir, usa a ultima sugestao pendente do autor.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'aplicar_patch',
      description:
        'Publica a sugestao pendente SO apos confirmacao na conversa ("sim", "pode", "pode publicar"). Se omitir id, aplica a ultima sugestao pendente DESTE autor. NUNCA fale de id/numero/# com o usuario — linguagem natural sempre.',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'number',
            description: 'Opcional interno. Prefira omitir e usar a ultima pendente do autor.',
          },
          confirmacao_dupla: {
            type: 'boolean',
            description: 'true quando o usuario confirmou troca grande do texto principal.',
          },
          texto_confirmacao: {
            type: 'string',
            description: 'Texto literal da confirmacao do usuario (ex.: ok, sim pode, pode publicar).',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'verificar_comportamento',
      description:
        'Depois de propor: simula 2 mensagens com o texto antes/depois e mostra se a resposta mudou. Nao cite id ao usuario.',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'number',
            description: 'Opcional interno. Se omitir, usa a ultima sugestao pendente do autor.',
          },
          mensagem_teste: {
            type: 'string',
            description: 'Opcional: mensagem do usuario para o teste (senao usa padrao).',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancelar_patch',
      description:
        'Descarta a sugestao pendente. Se omitir id, cancela a ultima pendente deste autor. Nunca cite numero ao usuario.',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'number',
            description: 'Opcional interno. Se omitir, cancela a ultima pendente do autor.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reverter_patch',
      description:
        'Desfaz a ultima mudanca publicada deste autor (ou a indicada). Fale com o usuario em linguagem natural, sem id.',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'number',
            description: 'Opcional interno. Se omitir, reverte a ultima mudanca deste autor.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propor_aprendizado',
      description:
        'Overlay de regra comportamental (NAO edita prompt_sistema). So se decidir_tipo_edicao indicar aprendizado_overlay.',
      parameters: {
        type: 'object',
        properties: {
          texto: {
            type: 'string',
            description:
              'OBRIGATORIO (min 5 caracteres). Regra comportamental a adicionar como overlay. Nunca deixe vazio.',
          },
        },
        required: ['texto'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'confirmar_aprendizado',
      description: 'Ativa aprendizado pendente apos confirmacao.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'number' } },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancelar_aprendizado',
      description: 'Cancela aprendizado pendente.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'number' } },
        required: ['id'],
      },
    },
  },
];
