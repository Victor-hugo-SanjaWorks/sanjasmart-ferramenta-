/**
 * Integracao Evolution API — Minas Placa clean.
 */
import { config } from '../config.js';
import { dividirResposta, normalizarRespostaWhatsapp } from './mensagem.js';
import { obterDelayAleatorioMs } from '../delay-config.js';
import { resolverNumeroEvolution } from './wa-jid.js';

function aguardar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function obterStatusConexao(instance: string): Promise<{
  conectado: boolean;
  state?: string;
  /** Rede/timeout — nao confundir com WhatsApp desconectado de verdade. */
  unknown?: boolean;
}> {
  try {
    const res = await fetch(`${config.evolutionUrl}/instance/connectionState/${instance}`, {
      headers: { apikey: config.evolutionApiKey },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return { conectado: false, state: 'unknown', unknown: true };
    const data = await res.json() as { state?: string; instance?: { state?: string } };
    const state = String(data.instance?.state ?? data.state ?? '').toLowerCase();
    return {
      conectado: state === 'open' || state === 'connected',
      state: state || 'unknown',
    };
  } catch {
    return { conectado: false, state: 'unknown', unknown: true };
  }
}
export interface InfoChatwootEvolution {
  enabled: boolean;
  accountId: string | null;
  url: string | null;
  inboxName: string | null;
}

export interface InfoInstanciaWhatsapp {
  instanceName: string;
  connected: boolean;
  state: string;
  /** true = falha de rede/timeout (nao e "Desconectado"). */
  unknown?: boolean;
  telefone: string | null;
  profileName: string | null;
  profilePicUrl: string | null;
  integration: string | null;
  chatwoot: InfoChatwootEvolution | null;
  atualizadoEm: string | null;
}

function headersEvolution(): Record<string, string> {
  return { apikey: config.evolutionApiKey, 'Content-Type': 'application/json' };
}

function telefoneDeOwnerJid(ownerJid: string | null | undefined): string | null {
  if (!ownerJid) return null;
  const n = ownerJid.replace(/@.*/, '').replace(/\D/g, '');
  return n || null;
}

type InstanciaEvolution = {
  name?: string;
  connectionStatus?: string;
  ownerJid?: string;
  profileName?: string;
  profilePicUrl?: string;
  integration?: string;
  updatedAt?: string;
  Chatwoot?: {
    enabled?: boolean;
    accountId?: string;
    url?: string;
    nameInbox?: string;
  };
};

async function buscarInstanciaEvolution(instance: string): Promise<InstanciaEvolution | null> {
  const res = await fetch(
    `${config.evolutionUrl}/instance/fetchInstances?instanceName=${encodeURIComponent(instance)}`,
    { headers: headersEvolution() },
  );
  if (!res.ok) return null;
  const data = await res.json() as InstanciaEvolution | InstanciaEvolution[];
  if (Array.isArray(data)) return data.find((i) => i.name === instance) ?? data[0] ?? null;
  return data;
}

export async function obterInfoInstancia(instance = config.evolutionInstance): Promise<InfoInstanciaWhatsapp> {
  const status = await obterStatusConexao(instance);
  if (status.unknown) {
    return {
      instanceName: instance,
      connected: false,
      state: 'unknown',
      unknown: true,
      telefone: null,
      profileName: null,
      profilePicUrl: null,
      integration: null,
      chatwoot: null,
      atualizadoEm: null,
    };
  }
  const inst = await buscarInstanciaEvolution(instance).catch(() => null);
  const state = String(inst?.connectionStatus ?? status.state ?? 'unknown').toLowerCase();
  const connected = status.conectado || state === 'open' || state === 'connected';
  const cw = inst?.Chatwoot;
  return {
    instanceName: instance,
    connected,
    state,
    telefone: telefoneDeOwnerJid(inst?.ownerJid),
    profileName: inst?.profileName ?? null,
    profilePicUrl: inst?.profilePicUrl ?? null,
    integration: inst?.integration ?? null,
    chatwoot: cw
      ? {
          enabled: cw.enabled === true,
          accountId: cw.accountId ?? null,
          url: cw.url ?? null,
          inboxName: cw.nameInbox ?? null,
        }
      : null,
    atualizadoEm: inst?.updatedAt ?? null,
  };
}

export async function desconectarInstancia(instance = config.evolutionInstance): Promise<{ ok: boolean; state?: string }> {
  const res = await fetch(`${config.evolutionUrl}/instance/logout/${instance}`, {
    method: 'DELETE',
    headers: headersEvolution(),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Evolution logout ${res.status}: ${txt}`);
  }
  const status = await obterStatusConexao(instance);
  return { ok: true, state: status.state };
}

export async function reiniciarInstancia(instance = config.evolutionInstance): Promise<{ ok: boolean; state?: string }> {
  const res = await fetch(`${config.evolutionUrl}/instance/restart/${instance}`, {
    method: 'POST',
    headers: headersEvolution(),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Evolution restart ${res.status}: ${txt}`);
  }
  await new Promise((r) => setTimeout(r, 2000));
  const status = await obterStatusConexao(instance);
  return { ok: true, state: status.state };
}

export async function enviarTextoSimples(
  instance: string,
  telefone: string,
  texto: string,
  delayMs = 1200,
  remoteJid?: string | null,
): Promise<void> {
  const number = await resolverNumeroEvolution(telefone, remoteJid, instance);
  console.log(`[evolution] sendText ${instance} -> ${number}`);
  const res = await fetch(`${config.evolutionUrl}/message/sendText/${instance}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: config.evolutionApiKey,
    },
    body: JSON.stringify({
      number,
      text: texto,
      delay: 0,
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Evolution erro ${res.status}: ${txt}`);
  }
}

export async function marcarMensagensLidas(
  instance: string,
  remoteJid: string,
  ids: string[],
): Promise<void> {
  const jid = remoteJid.trim();
  if (!jid || !ids.length) return;
  const corpo = {
    readMessages: ids.filter(Boolean).map((id) => ({
      id,
      fromMe: false,
      remoteJid: jid,
    })),
  };
  try {
    const res = await fetch(`${config.evolutionUrl}/chat/markMessageAsRead/${instance}`, {
      method: 'POST',
      headers: headersEvolution(),
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.warn(`[evolution] markAsRead ${res.status} ${await res.text().catch(() => '')}`);
    }
  } catch (err) {
    console.warn('[evolution] markAsRead:', err instanceof Error ? err.message : err);
  }
}

export async function enviarPresenca(
  instance: string,
  number: string,
  presence: 'available' | 'composing' | 'paused' = 'available',
  delayMs = 0,
): Promise<void> {
  if (!number) return;
  const destino = number.includes('@') ? number : number.replace(/\D/g, '');
  const timeout = Math.max(10_000, delayMs + 6_000);
  const formatos: Record<string, unknown>[] = [
    { number: destino, delay: delayMs, presence },
    { number: destino, options: { delay: delayMs, presence } },
  ];
  for (const body of formatos) {
    try {
      const res = await fetch(`${config.evolutionUrl}/chat/sendPresence/${instance}`, {
        method: 'POST',
        headers: headersEvolution(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeout),
      });
      if (res.ok) return;
      console.warn(`[evolution] sendPresence ${res.status} ${await res.text().catch(() => '')}`);
    } catch (err) {
      console.warn('[evolution] sendPresence:', err instanceof Error ? err.message : err);
    }
  }
}

/** Tempo visível de "digitando..." — uma vez por resposta, não por fragmento. */
export function delayDigitandoMs(texto: string): number {
  const n = String(texto || '').length;
  return Math.min(3200, Math.max(1400, 900 + n * 18));
}

export async function habilitarLeituraAutomatica(instance: string): Promise<void> {
  try {
    const atualRes = await fetch(`${config.evolutionUrl}/settings/find/${instance}`, {
      headers: headersEvolution(),
      signal: AbortSignal.timeout(8000),
    });
    const atual = atualRes.ok ? await atualRes.json() as Record<string, unknown> : {};
    const body = {
      ...atual,
      alwaysOnline: true,
      readMessages: true,
      readStatus: true,
    };
    const res = await fetch(`${config.evolutionUrl}/settings/set/${instance}`, {
      method: 'POST',
      headers: headersEvolution(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.warn(`[evolution] settings/set ${res.status} ${await res.text().catch(() => '')}`);
      return;
    }
    console.log('[evolution] leitura automatica e alwaysOnline ligados');
  } catch (err) {
    console.warn('[evolution] settings:', err instanceof Error ? err.message : err);
  }
}

export async function enviarRespostaFragmentada(
  instance: string,
  telefone: string,
  textoCompleto: string,
  opts?: { fragmentar?: boolean; ignorarDigitando?: boolean },
): Promise<number> {
  const textos = opts?.fragmentar === false
    ? [normalizarRespostaWhatsapp(textoCompleto)]
    : dividirResposta(normalizarRespostaWhatsapp(textoCompleto));

  for (const texto of textos) {
    const delayMs = await obterDelayAleatorioMs();
    await aguardar(delayMs);
    await enviarTextoSimples(instance, telefone, texto, delayMs);
  }
  return textos.length;
}

export async function tentarEnviarResposta(
  telefone: string,
  textoCompleto: string,
  instance: string,
  opts?: { remoteJid?: string; mensagensEntrada?: number; fragmentar?: boolean },
): Promise<{ enviado: boolean; fragmentos: number; motivo?: string }> {
  const status = await obterStatusConexao(instance);
  if (!status.conectado) {
    return { enviado: false, fragmentos: 0, motivo: 'whatsapp_desconectado' };
  }
  try {
    const fragmentos = await enviarRespostaFragmentada(instance, telefone, textoCompleto, {
      fragmentar: opts?.fragmentar,
    });
    return { enviado: true, fragmentos };
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err);
    return { enviado: false, fragmentos: 0, motivo };
  }
}
