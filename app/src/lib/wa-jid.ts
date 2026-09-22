/**
 * Mapa telefone ↔ JID de envio (WhatsApp LID).
 * Enviar para @s.whatsapp.net falha quando o chat chegou como @lid.
 */
import { config } from '../config.js';
import { obterRedis } from './redis.js';
import { canonizarTelefoneBr, jidEhLid, jidParaEnvio, variantesTelefoneBr } from '../util/telefone.js';

const redis = obterRedis();
const PREFIXO = 'wa:jid:';
const PREFIXO_MISS = 'wa:jid:miss:';
const TTL = 60 * 60 * 24 * 30;
const TTL_MISS = 60;

export async function lembrarJidEnvio(telefone: string, remoteJid: string): Promise<void> {
  const tel = canonizarTelefoneBr(telefone);
  const jid = jidParaEnvio(remoteJid);
  if (!tel || !jid) return;
  const atual = await redis.get(`${PREFIXO}${tel}`);
  if (jidEhLid(atual) && !jidEhLid(jid)) return;
  await redis.set(`${PREFIXO}${tel}`, jid, 'EX', TTL);
}

export async function obterJidEnvio(telefone: string): Promise<string | null> {
  const tel = canonizarTelefoneBr(telefone);
  if (!tel) return null;
  const jid = await redis.get(`${PREFIXO}${tel}`);
  return jid || null;
}

type ChatEvo = {
  remoteJid?: string;
  remoteJidAlt?: string;
  lastMessage?: { key?: { remoteJid?: string; remoteJidAlt?: string } };
};

function altCasaComTelefone(alt: string, variants: string[]): boolean {
  if (!alt) return false;
  const digits = alt.replace(/\D/g, '');
  return variants.some(
    (v) => alt.includes(v) || digits === v || (v.length >= 11 && digits.endsWith(v.slice(-11))),
  );
}

export async function descobrirLidNoEvolution(
  instance: string,
  telefone: string,
): Promise<string | null> {
  const tel = canonizarTelefoneBr(telefone);
  const variants = variantesTelefoneBr(telefone);
  if (!tel || !variants.length || !config.evolutionUrl || !config.evolutionApiKey) return null;
  if (await redis.get(`${PREFIXO_MISS}${tel}`)) return null;
  try {
    const res = await fetch(`${config.evolutionUrl}/chat/findChats/${instance}`, {
      method: 'POST',
      headers: { apikey: config.evolutionApiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ where: {} }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as ChatEvo[] | { chats?: ChatEvo[] };
    const chats = Array.isArray(data) ? data : data.chats || [];
    for (const c of chats) {
      const jid = String(c.remoteJid || '');
      if (!jidEhLid(jid)) continue;
      const alt = String(c.remoteJidAlt || c.lastMessage?.key?.remoteJidAlt || '');
      if (!altCasaComTelefone(alt, variants)) continue;
      await lembrarJidEnvio(telefone, jid);
      console.log(`[wa-jid] LID ${jid} para ${tel}`);
      return jid;
    }
    await redis.set(`${PREFIXO_MISS}${tel}`, '1', 'EX', TTL_MISS);
  } catch (err) {
    console.warn('[wa-jid] findChats:', err instanceof Error ? err.message : err);
  }
  return null;
}

export async function resolverNumeroEvolution(
  telefone: string,
  remoteJid?: string | null,
  instance?: string,
): Promise<string> {
  const mapped = await obterJidEnvio(telefone);
  if (mapped && jidEhLid(mapped)) return mapped;
  const jid = jidParaEnvio(remoteJid || '');
  if (jidEhLid(jid)) {
    await lembrarJidEnvio(telefone, jid);
    return jid;
  }
  const inst = instance || config.evolutionInstance;
  const discovered = await descobrirLidNoEvolution(inst, telefone);
  if (discovered) return discovered;
  if (mapped) return mapped;
  if (jid.includes('@s.whatsapp.net')) return jid;
  return canonizarTelefoneBr(telefone) || telefone;
}
