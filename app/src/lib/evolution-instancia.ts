/**
 * Create/delete de instâncias na Evolution API (+ Chatwoot opcional).
 * Usado pelo CRUD multi-linha do painel WhatsApp.
 */
import { config } from '../config.js';

function headers(): Record<string, string> {
  return { apikey: config.evolutionApiKey!, 'Content-Type': 'application/json' };
}

export async function evolutionInstanciaExiste(instance: string): Promise<boolean> {
  const res = await fetch(
    `${config.evolutionUrl}/instance/fetchInstances?instanceName=${encodeURIComponent(instance)}`,
    { headers: headers() },
  );
  if (!res.ok) return false;
  const data = (await res.json()) as unknown;
  if (Array.isArray(data)) {
    return data.some((i) => (i as { name?: string }).name === instance);
  }
  return Boolean(data && typeof data === 'object' && (data as { name?: string }).name === instance);
}

export type CriarEvoOpts = {
  instanceName: string;
  webhookUrl: string;
  inboxName?: string;
};

export async function criarInstanciaEvolution(opts: CriarEvoOpts): Promise<void> {
  if (await evolutionInstanciaExiste(opts.instanceName)) return;

  const body: Record<string, unknown> = {
    instanceName: opts.instanceName,
    integration: 'WHATSAPP-BAILEYS',
    qrcode: true,
    webhook: {
      url: opts.webhookUrl,
      byEvents: false,
      base64: true,
      events: ['CONNECTION_UPDATE', 'MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'QRCODE_UPDATED'],
    },
  };

  const accountId = config.chatwootAccountId;
  const token = config.chatwootPlatformToken || config.chatwootApiAccessToken;
  if (accountId && token) {
    body.chatwoot = {
      enabled: true,
      accountId,
      token,
      url: config.chatwootUrl,
      nameInbox: opts.inboxName || opts.instanceName,
      signMsg: false,
      reopenConversation: true,
      conversationPending: true,
      mergeBrazilContacts: true,
      importContacts: false,
      importMessages: false,
    };
  }

  const res = await fetch(`${config.evolutionUrl}/instance/create`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as {
    response?: { message?: unknown };
    message?: unknown;
    error?: unknown;
  };
  if (!res.ok) {
    const msg = data.response?.message ?? data.message ?? data.error ?? res.status;
    throw new Error(`Evolution create: ${JSON.stringify(msg)}`);
  }
}

export async function excluirInstanciaEvolution(instance: string): Promise<void> {
  if (!(await evolutionInstanciaExiste(instance))) return;
  await fetch(`${config.evolutionUrl}/instance/logout/${instance}`, {
    method: 'DELETE',
    headers: headers(),
  }).catch(() => undefined);
  const res = await fetch(`${config.evolutionUrl}/instance/delete/${instance}`, {
    method: 'DELETE',
    headers: headers(),
  });
  if (!res.ok && res.status !== 404) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Evolution delete ${res.status}: ${txt}`);
  }
}
