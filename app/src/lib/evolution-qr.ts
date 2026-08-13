/**
 * Garante instância na Evolution e obtém QR.
 * Delega create para evolution-instancia (com Chatwoot opcional).
 */
import { config } from '../config.js';
import { criarInstanciaEvolution, evolutionInstanciaExiste } from './evolution-instancia.js';

function headers(): Record<string, string> {
  return { apikey: config.evolutionApiKey!, 'Content-Type': 'application/json' };
}

export type QrEvolution = {
  connected?: boolean;
  code?: string;
  pairingCode?: string | null;
  message?: string;
  criada?: boolean;
};

export async function garantirInstanciaEvolution(
  instance: string,
  inboxName?: string,
): Promise<boolean> {
  if (await evolutionInstanciaExiste(instance)) return false;
  const webhookUrl =
    process.env.IAGMX_WEBHOOK_EVOLUTION_URL || `${config.publicUrl}/webhook/evolution`;
  await criarInstanciaEvolution({
    instanceName: instance,
    webhookUrl,
    inboxName: inboxName || instance,
  });
  return true;
}

export async function obterQrEvolution(instance: string): Promise<QrEvolution> {
  const criada = await garantirInstanciaEvolution(instance);

  const stateRes = await fetch(
    `${config.evolutionUrl}/instance/connectionState/${instance}`,
    { headers: headers() },
  );
  const stateData = (await stateRes.json().catch(() => ({}))) as {
    state?: string;
    instance?: { state?: string };
  };
  const current = String(stateData.instance?.state ?? stateData.state ?? '').toLowerCase();
  if (current === 'open' || current === 'connected') {
    return { connected: true, criada };
  }

  const res = await fetch(`${config.evolutionUrl}/instance/connect/${instance}`, {
    headers: headers(),
  });
  const data = (await res.json().catch(() => ({}))) as {
    code?: string;
    qrcode?: string | { base64?: string; code?: string };
    base64?: string;
    pairingCode?: string | null;
    message?: unknown;
    error?: unknown;
    response?: { message?: unknown };
  };

  let code = data.base64 ?? data.code;
  if (!code && data.qrcode && typeof data.qrcode === 'object') {
    code = data.qrcode.base64 ?? data.qrcode.code;
  } else if (typeof data.qrcode === 'string') {
    code = data.qrcode;
  }

  if (!res.ok && !code) {
    const msg = data.response?.message ?? data.message ?? data.error ?? res.status;
    return { message: String(typeof msg === 'string' ? msg : JSON.stringify(msg)), criada };
  }

  return { code, pairingCode: data.pairingCode ?? null, criada };
}
