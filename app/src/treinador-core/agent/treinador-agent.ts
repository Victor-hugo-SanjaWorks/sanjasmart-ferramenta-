/**
 * Loop ReAct do modo treinador: LLM com tools, observar, repetir ate responder.
 * Conversa primeiro; so muta via tools de confirmacao.
 * F4.9: retry+backoff no LLM; se cair de vez, enfileira o pedido.
 */
import {
  obterChatComTools,
  type ChatWithToolsFn,
} from '../ports/chat-com-tools.js';
import { TOOLS_TREINADOR } from './tool-defs.js';
import { formatarRespostaWhatsapp } from './formatar-whatsapp.js';
import {
  MAX_TURNOS_AGENTE,
  PROMPT_SISTEMA_TREINADOR_AGENTE,
} from './treinador-system-prompt.js';
import { comRetry } from '../servicos/treinamento-llm-retry.js';
import {
  filtrarToolsModoSugerir,
  modoSoSugerirAtivo,
  msgModoSoSugerir,
  toolBloqueadaNoModoSugerir,
} from '../servicos/treinamento-modo-sugerir.js';
import {
  avisarReatividade,
  fallbackComFila,
  montarMensagens,
  sanitizarToolCalls,
  TOOLS_MUTACAO,
  type EntradaAgenteTreinador,
} from './treinador-agent-helpers.js';

export type { EntradaAgenteTreinador };

export interface ContextoToolTreinadorLeve {
  telefone: string;
  nomeAutor?: string;
  canal?: 'whatsapp' | 'dashboard';
}

export type ExecutarToolFn = (
  nome: string,
  argsJson: string,
  ctx: ContextoToolTreinadorLeve,
) => Promise<string>;

export async function rodarAgenteTreinador(opts: EntradaAgenteTreinador): Promise<string> {
  const inicio = Date.now();
  try {
    return await rodarAgenteTreinadorCore(opts);
  } finally {
    const { registrarLatenciaAgente } = await import('../servicos/treinamento-latencia.js');
    void registrarLatenciaAgente(Date.now() - inicio);
  }
}

async function rodarAgenteTreinadorCore(opts: EntradaAgenteTreinador): Promise<string> {
  const { checarRateLimitTreinador, msgRateLimitExcedido } = await import(
    '../servicos/treinamento-rate-limit.js'
  );
  const limite = checarRateLimitTreinador(opts.telefone);
  if (!limite.ok) {
    return msgRateLimitExcedido(limite.retryEmMs);
  }

  const chatFn: ChatWithToolsFn | null = opts.chatComTools || obterChatComTools();
  if (!chatFn) {
    return fallbackComFila(opts, new Error('chatComTools_ausente'));
  }

  const soSugerir = modoSoSugerirAtivo(opts);
  const toolsAtivas = soSugerir
    ? filtrarToolsModoSugerir(TOOLS_TREINADOR)
    : TOOLS_TREINADOR;

  const ctx: ContextoToolTreinadorLeve = {
    telefone: opts.telefone,
    nomeAutor: opts.pushName,
    canal: opts.canal || 'whatsapp',
  };

  const messages = montarMensagens(opts.historico || [], opts.textoUsuario);
  if (soSugerir) {
    messages[0] = {
      role: 'system',
      content:
        PROMPT_SISTEMA_TREINADOR_AGENTE +
        '\n\nMODO SO-SUGERIR ATIVO: nao proponha nem aplique patch; apenas analise e recomende texto.',
    };
  }
  const mutacoesExecutadas: string[] = [];

  await avisarReatividade(
    opts.onReatividade,
    soSugerir
      ? 'Estou analisando e te dando uma sugestao sem publicar nada...'
      : 'Estou analisando o que voce pediu e montando a melhor sugestao...',
  );

  for (let turno = 0; turno < MAX_TURNOS_AGENTE; turno++) {
    let resultado;
    try {
      resultado = await comRetry(
        () =>
          chatFn(messages, toolsAtivas, {
            temperature: 0.25,
            max_tokens: 1200,
          }),
        { maxTentativas: 3, baseMs: 500, jitterMs: 150 },
      );
    } catch (error) {
      console.error(
        '[treinador-agent] chat LLM falhou apos retry:',
        error instanceof Error ? error.message : error,
      );
      return fallbackComFila(opts, error);
    }

    const toolCalls = sanitizarToolCalls(resultado.tool_calls || []);
    if (!toolCalls.length) {
      const texto = formatarRespostaWhatsapp(resultado.content || '');
      return (
        texto ||
        'Pode me dar um pouco mais de detalhe sobre o que quer ajustar? Nenhuma mudanca foi aplicada.'
      );
    }

    messages.push({
      role: 'assistant',
      content: resultado.content,
      tool_calls: toolCalls,
    });

    for (const call of toolCalls) {
      if (soSugerir && toolBloqueadaNoModoSugerir(call.function.name)) {
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          name: call.function.name,
          content: JSON.stringify({ recusado: true, motivo: msgModoSoSugerir() }),
        });
        continue;
      }
      if (/propor_|buscar_|aplicar_|confirmar_|avaliar_|listar_|reverter_|cancelar_/.test(call.function.name)) {
        await avisarReatividade(
          opts.onReatividade,
          'Estou verificando isso para te responder com seguranca...',
        );
      }
      const runTool =
        opts.executarTool ||
        (await import('./tool-runner.js')).executarToolTreinadorSeguro;
      let observacao: string;
      try {
        observacao = await runTool(call.function.name, call.function.arguments, ctx);
      } catch (error) {
        observacao = JSON.stringify({
          erro: error instanceof Error ? error.message : 'falha na tool',
          tool: call.function.name,
        });
      }
      if (TOOLS_MUTACAO.has(call.function.name)) {
        mutacoesExecutadas.push(call.function.name);
      }
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        name: call.function.name,
        content: observacao,
      });

      if (call.function.name === 'propor_patch') {
        try {
          const obs = JSON.parse(observacao) as {
            id?: number;
            erro?: string;
            respostaUsuario?: string;
            instrucao?: string;
          };
          if (obs && obs.id && !obs.erro) {
            const msg = formatarRespostaWhatsapp(
              obs.respostaUsuario || obs.instrucao || '',
            );
            return (
              msg ||
              'Preparei uma sugestao para voce revisar. Se gostar, eu publico; se quiser, eu ajusto.'
            );
          }
        } catch {
          /* observacao nao era JSON valido: segue o fluxo normal do agente. */
        }
      }
    }
  }

  const avisoMutacao = mutacoesExecutadas.length
    ? ' Ja deixei uma sugestao pronta para voce revisar.'
    : ' Nada foi alterado.';

  return (
    'Cheguei no limite desta rodada e prefiro nao arriscar uma resposta pela metade. ' +
    'Me diga o que ainda falta ou confirme a ultima sugestao.' +
    avisoMutacao
  );
}
