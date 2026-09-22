/**
 * WhatsApp Cloud API (Meta) — envio de texto.
 */
import { obterMetaConfig } from '../meta-config.js';

async function checkCredentials() {
  const meta = await obterMetaConfig();
  if (!meta.accessToken) {
    throw new Error('META_ACCESS_TOKEN nao configurado');
  }
  if (!meta.phoneId) {
    throw new Error('META_PHONE_NUMBER_ID nao configurado');
  }
  return meta;
}

function headersMeta(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}

export async function enviarMensagemTextoMeta(telefone: string, texto: string): Promise<unknown> {
  const meta = await checkCredentials();
  const url = `https://graph.facebook.com/v20.0/${meta.phoneId}/messages`;
  const to = telefone.replace(/\D/g, '');

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: {
      preview_url: false,
      body: texto,
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: headersMeta(meta.accessToken!),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Meta API Error (Send Text): ${res.status} - ${errorText}`);
  }

  return await res.json();
}
