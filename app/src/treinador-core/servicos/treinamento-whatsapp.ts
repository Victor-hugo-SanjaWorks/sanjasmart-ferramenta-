/**
 * Entrada WhatsApp do modo treinador e re-exports publicos.
 * Delega CRUD a telefones/aprendizados; aqui fica o gate + agente ReAct.
 * Relacionado: agent/treinador-agent.ts, treinamento-fila-turno.ts.
 */
import { adicionarAoHistorico, obterHistorico } from '../host/historico.js';
import { inicializarTreinamentoWhatsapp } from './treinamento-whatsapp-db.js';

export type { TelefoneTreinador } from './treinamento-whatsapp-telefones.js';
export type { AprendizadoWhatsapp, PropostaAprendizadoWhatsapp } from './treinamento-whatsapp-aprendizados.js';

export {
  listarTelefonesTreinadores,
  criarTelefoneTreinador,
  atualizarTelefoneTreinador,
  excluirTelefoneTreinador,
  telefoneAutorizadoTreinamento,
} from './treinamento-whatsapp-telefones.js';

export {
  listarAprendizadosWhatsapp,
  listarPendenciasAprendizadoWhatsapp,
  excluirAprendizadoWhatsapp,
  aprovarPendenciaAprendizadoWhatsapp,
  cancelarPendenciaAprendizadoWhatsapp,
  obterBlocoTreinamentoWhatsapp,
} from './treinamento-whatsapp-aprendizados.js';

export { inicializarTreinamentoWhatsapp };

/**
 * Entrada do WhatsApp no modo treinador.
 * Delega ao agente (tools + conversa). Nao aplica patch/aprendizado automaticamente.
 * F4.9: "processar fila" retoma o pedido mais antigo pendente deste telefone.
 */
export async function processarMensagemTreinamentoWhatsapp(opts: {
  telefone: string;
  remoteJid: string;
  textoUsuario: string;
  pushName?: string;
  onReatividade?: (mensagem: string) => Promise<void>;
}): Promise<string> {
  await inicializarTreinamentoWhatsapp();
  const texto = opts.textoUsuario.trim();

  const { checarRateLimitTreinador, msgRateLimitExcedido } = await import(
    './treinamento-rate-limit.js'
  );
  const limite = checarRateLimitTreinador(opts.telefone);
  if (!limite.ok) {
    const msg = msgRateLimitExcedido(limite.retryEmMs);
    await adicionarAoHistorico(opts.remoteJid, 'assistant', msg);
    return msg;
  }

  await adicionarAoHistorico(opts.remoteJid, 'user', texto);

  const { resolverFilaNoTurno, finalizarFilaAposResposta } = await import(
    './treinamento-fila-turno.js'
  );
  const fila = await resolverFilaNoTurno(opts.telefone, texto);
  if (fila.abortar && fila.respostaPronta) {
    await adicionarAoHistorico(opts.remoteJid, 'assistant', fila.respostaPronta);
    return fila.respostaPronta;
  }

  const historico = await obterHistorico(opts.remoteJid, { limite: 20 }).catch(() => []);
  const { rodarAgenteTreinador } = await import('../agent/treinador-agent.js');
  const bruta = await rodarAgenteTreinador({
    telefone: opts.telefone,
    remoteJid: opts.remoteJid,
    textoUsuario: fila.textoEfetivo,
    pushName: opts.pushName,
    historico,
    onReatividade: opts.onReatividade,
  });

  const histResumo = historico
    .slice(-8)
    .map((h: { role?: string; content?: string }) => `${h.role || '?'}: ${String(h.content || '').slice(0, 200)}`)
    .join('\n');
  const { revisarRespostaTreinador } = await import('../agent/treinador-camadas.js');
  const rev = await revisarRespostaTreinador({
    telefone: opts.telefone,
    textoCamada1: bruta,
    historicoResumo: histResumo + `\nuser: ${fila.textoEfetivo}`,
    contatoId: opts.telefone,
  });

  const corpo = await finalizarFilaAposResposta(opts.telefone, fila.pedidoId, rev.mensagem);
  const final = fila.prefixo + corpo;
  await adicionarAoHistorico(opts.remoteJid, 'assistant', final);
  return final;
}
