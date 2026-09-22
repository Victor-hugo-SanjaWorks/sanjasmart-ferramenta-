/**
 * Envio WhatsApp SanjaSmart: Evolution (2.25 / infra-3). Fallback Uaz se houver linha.
 */
import { config } from '../config.js';
import {
  enviarTextoSimples as evoTexto,
  obterStatusConexao as evoStatus,
  enviarPresenca,
  delayDigitandoMs,
} from './evolution.js';
import { uazEnviarTexto, uazStatus } from './uazapi.js';
import { eUazAtendimento, resolverMetaInstancia } from './whatsapp-instancias.js';
import { canonizarTelefoneBr, variantesTelefoneBr } from '../util/telefone.js';
import { dividirResposta, normalizarRespostaWhatsapp } from './mensagem.js';
import { resolverNumeroEvolution } from './wa-jid.js';

export async function statusCanal(instance?: string | null): Promise<{
  conectado: boolean;
  state?: string;
  provider: string;
}> {
  if (eUazAtendimento(instance)) {
    const s = await uazStatus();
    return { conectado: s.conectado, state: s.state, provider: 'uazapi' };
  }
  const inst = resolverMetaInstancia(instance || config.evolutionInstance).name;
  const s = await evoStatus(inst);
  return { conectado: s.conectado, state: s.state, provider: 'evolution' };
}

export async function enviarTextoCanal(
  instance: string | null | undefined,
  telefone: string,
  texto: string,
  delayMs = 800,
  remoteJid?: string | null,
): Promise<void> {
  const tel = canonizarTelefoneBr(telefone) || telefone;
  if (eUazAtendimento(instance)) {
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    await uazEnviarTexto(tel, texto);
    return;
  }
  const meta = resolverMetaInstancia(instance || config.evolutionInstance);
  try {
    await evoTexto(meta.name, tel, texto, delayMs, remoteJid);
  } catch (err) {
    const variantes = variantesTelefoneBr(tel);
    const alt = variantes.find((v) => v !== tel);
    if (alt) {
      console.log(`[canal-envio] tentando variante ${alt} para ${tel}`);
      await evoTexto(meta.name, alt, texto, delayMs, remoteJid);
    } else {
      throw err;
    }
  }
}

export async function tentarEnviarCanal(
  telefone: string,
  textoCompleto: string,
  instance: string,
  opts?: { fragmentar?: boolean; remoteJid?: string | null },
): Promise<{ enviado: boolean; fragmentos: number; motivo?: string }> {
  const st = await statusCanal(instance);
  if (!st.conectado) {
    return { enviado: false, fragmentos: 0, motivo: 'whatsapp_desconectado' };
  }
  try {
    const numero = await resolverNumeroEvolution(telefone, opts?.remoteJid, instance);
    const textos = opts?.fragmentar === false
      ? [normalizarRespostaWhatsapp(textoCompleto)]
      : dividirResposta(normalizarRespostaWhatsapp(textoCompleto));
    await enviarPresenca(instance, numero, 'composing', delayDigitandoMs(textos.join(' ')));
    let n = 0;
    for (const t of textos) {
      await enviarTextoCanal(instance, telefone, t, 0, opts?.remoteJid);
      n++;
    }
    return { enviado: true, fragmentos: n };
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err);
    return { enviado: false, fragmentos: 0, motivo };
  }
}
