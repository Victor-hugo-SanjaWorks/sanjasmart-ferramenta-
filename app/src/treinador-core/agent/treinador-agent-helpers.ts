/**
 * Helpers puros do loop ReAct do treinador: mensagens, fallbacks e sanitizacao.
 * Extraidos de treinador-agent.ts para manter o agente abaixo de 300 linhas.
 * Nao executam tools — so montam contexto e respostas de degradacao.
 */
import type { ChatMessageWithTools, ChatWithToolsFn, ToolCall } from '../ports/chat-com-tools.js';
import { PROMPT_SISTEMA_TREINADOR_AGENTE } from './treinador-system-prompt.js';

export interface EntradaAgenteTreinador {
  telefone: string;
  remoteJid: string;
  textoUsuario: string;
  pushName?: string;
  historico?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  chatComTools?: ChatWithToolsFn;
  executarTool?: (
    nome: string,
    argsJson: string,
    ctx: { telefone: string; nomeAutor?: string; canal?: 'whatsapp' | 'dashboard' },
  ) => Promise<string>;
  onReatividade?: (mensagem: string) => Promise<void>;
  canal?: 'whatsapp' | 'dashboard';
  modoSoSugerir?: boolean;
}

export const TOOLS_MUTACAO = new Set([
  'aplicar_patch',
  'confirmar_aprendizado',
  'propor_patch',
  'propor_aprendizado',
  'cancelar_patch',
  'cancelar_aprendizado',
  'reverter_patch',
]);

export function montarMensagens(
  historico: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  textoUsuario: string,
): ChatMessageWithTools[] {
  const msgs: ChatMessageWithTools[] = [
    { role: 'system', content: PROMPT_SISTEMA_TREINADOR_AGENTE },
  ];
  const texto = String(textoUsuario || '').trim();
  const uteis = historico
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .filter((m) => String(m.content || '').trim().length > 0)
    .slice(-16);
  for (const m of uteis) {
    msgs.push({ role: m.role, content: m.content });
  }
  const ultima = uteis[uteis.length - 1];
  if (!ultima || ultima.role !== 'user' || ultima.content !== texto) {
    msgs.push({ role: 'user', content: texto || '(mensagem vazia)' });
  }
  return msgs;
}

export async function avisarReatividade(
  onReatividade: EntradaAgenteTreinador['onReatividade'],
  mensagem: string,
): Promise<void> {
  if (!onReatividade) return;
  try {
    await onReatividade(mensagem);
  } catch {
    /* reatividade nao deve derrubar o agente */
  }
}

export function sanitizarToolCalls(calls: ToolCall[]): ToolCall[] {
  const vistos = new Set<string>();
  const limpos: ToolCall[] = [];
  for (const call of calls) {
    const nome = String(call?.function?.name || '').trim();
    if (!nome) continue;
    const id = String(call?.id || '').trim() || `call_${limpos.length + 1}`;
    if (vistos.has(id)) continue;
    vistos.add(id);
    let args = call.function?.arguments as unknown;
    if (typeof args !== 'string') {
      try {
        args = JSON.stringify(args ?? {});
      } catch {
        args = '{}';
      }
    }
    if (!String(args).trim()) args = '{}';
    limpos.push({
      id,
      type: 'function',
      function: { name: nome, arguments: String(args) },
    });
  }
  return limpos;
}

export async function fallbackSemTools(textoUsuario: string): Promise<string> {
  return (
    'Tive um problema de conexao por aqui e nao consegui terminar agora. ' +
    'Ja anotei o que voce quer mudar no texto da IA, mas nada foi alterado ainda. ' +
    `Seu pedido ficou registrado assim: "${String(textoUsuario || '').slice(0, 180)}". ` +
    'Se quiser, me chama de novo daqui a pouco que eu continuo de onde parei.'
  );
}

export async function fallbackComFila(
  opts: EntradaAgenteTreinador,
  erro: unknown,
): Promise<string> {
  try {
    const { enfileirarPedidoTreinador } = await import(
      '../servicos/treinamento-fila-pedidos.js'
    );
    const item = await enfileirarPedidoTreinador({
      telefone: opts.telefone,
      texto: opts.textoUsuario,
      canal: opts.canal || 'whatsapp',
      erro: erro instanceof Error ? erro.message : String(erro || 'llm_indisponivel'),
    });
    return (
      `Tive uma oscilacao aqui, mas ja guardei o seu pedido para retomar depois. ` +
      `Nada foi alterado ainda. Quando quiser, pode me chamar de novo com algo como ` +
      `"oi, e aquilo?" ou simplesmente repetir o pedido que eu continuo.`
    );
  } catch (errFila) {
    console.error('[treinador-agent] falha ao enfileirar:', errFila);
    return fallbackSemTools(opts.textoUsuario);
  }
}
