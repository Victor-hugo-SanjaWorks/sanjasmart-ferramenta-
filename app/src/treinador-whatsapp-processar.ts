/**
 * Ponte frota → orquestrador agentico (ReAct + tools).
 * Mesmo cerebro do modo-treinador-ia / GMX, sem viés de marca.
 */
import { jidParaTelefone, normalizarTelefone } from './util/telefone.js';
import {
  inicializarTreinamentoWhatsapp,
  processarMensagemTreinamentoWhatsapp,
  telefoneAutorizadoTreinamento,
} from './treinador-core/servicos/treinamento-whatsapp.js';

export async function processarSeTreinadorWhatsapp(opts: {
  telefone: string;
  mensagem: string;
  remoteJid?: string;
  pushName?: string;
  onReatividade?: (mensagem: string) => Promise<void>;
}): Promise<string | null> {
  const tel = normalizarTelefone(opts.telefone);
  if (!(await telefoneAutorizadoTreinamento(tel))) return null;

  await inicializarTreinamentoWhatsapp();
  const remoteJid = opts.remoteJid || `${tel}@s.whatsapp.net`;
  return processarMensagemTreinamentoWhatsapp({
    telefone: tel,
    remoteJid,
    textoUsuario: opts.mensagem,
    pushName: opts.pushName,
    onReatividade: opts.onReatividade,
  });
}

export { telefoneAutorizadoTreinamento as telefoneAutorizadoTreinador };
export { inicializarTreinamentoWhatsapp as inicializarTreinadorWhatsappFrota };
