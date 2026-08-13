/**
 * Shim: historico Postgres do host com API jid/papel/texto do treinador.
 */
import {
  adicionarAoHistorico as addHost,
  obterHistorico as obterHost,
} from '../../historico-minasplaca.js';
import { jidParaTelefone } from '../../util/telefone.js';

export async function adicionarAoHistorico(
  remoteJid: string,
  papel: 'user' | 'assistant' | 'system',
  texto: string,
): Promise<void> {
  const tel = jidParaTelefone(remoteJid);
  const role = papel === 'system' ? 'assistant' : papel;
  await addHost(tel, [{ role, content: texto, timestamp: Date.now() }]);
}

export async function obterHistorico(
  remoteJid: string,
  opts?: { limite?: number },
): Promise<Array<{ role: 'user' | 'assistant' | 'system'; content: string }>> {
  const tel = jidParaTelefone(remoteJid);
  const rows = await obterHost(tel, opts?.limite ?? 20);
  return rows.map((m: { role: string; content: string }) => ({
    role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
    content: m.content,
  }));
}
