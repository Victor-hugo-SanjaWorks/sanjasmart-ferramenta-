/**
 * Envio de texto via conversa Chatwoot (inbox Cloud API nativa).
 */
import { config } from '../config.js';
import { chatwootFetch } from '../chatwoot-sync.js';
import { canonizarTelefoneBr } from '../util/telefone.js';

async function jsonDe(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export async function garantirConversaChatwootMeta(
  telefone: string,
  nome?: string,
): Promise<number> {
  const accountId = config.chatwootAccountId;
  const inboxId = config.chatwootMetaInboxId;
  if (!accountId || !inboxId) throw new Error('Chatwoot Meta inbox nao configurada');

  const tel = canonizarTelefoneBr(telefone);
  const phoneFormated = tel.startsWith('+') ? tel : `+${tel}`;

  const cRes = await chatwootFetch(
    `/api/v1/accounts/${accountId}/contacts/search?q=${encodeURIComponent(phoneFormated)}`,
  );
  const cData = await jsonDe(cRes);
  let contactId = cData.payload?.length ? cData.payload[0].id : null;

  if (!contactId) {
    const cCreate = await chatwootFetch(`/api/v1/accounts/${accountId}/contacts`, {
      method: 'POST',
      body: JSON.stringify({
        phone_number: phoneFormated,
        name: (nome || '').trim() || phoneFormated,
      }),
    });
    const cCreateData = await jsonDe(cCreate);
    contactId = cCreateData.payload?.contact?.id ?? cCreateData.payload?.id ?? null;
    if (!contactId) throw new Error('Falha ao criar contato Chatwoot');
  }

  const convRes = await chatwootFetch(
    `/api/v1/accounts/${accountId}/contacts/${contactId}/conversations`,
  );
  const convData = await jsonDe(convRes);
  const lista = Array.isArray(convData.payload) ? convData.payload : [];
  const inboxNum = Number(inboxId);
  const conv = lista.find((c: any) => Number(c.inbox_id) === inboxNum) ?? lista[0];
  if (conv?.id) return Number(conv.id);

  const convCreate = await chatwootFetch(`/api/v1/accounts/${accountId}/conversations`, {
    method: 'POST',
    body: JSON.stringify({
      inbox_id: inboxNum,
      contact_id: contactId,
      source_id: phoneFormated.replace(/\D/g, ''),
    }),
  });
  const convCreateData = await jsonDe(convCreate);
  const id = convCreateData.id ?? convCreateData.payload?.id;
  if (!id) throw new Error('Falha ao criar conversa Chatwoot');
  return Number(id);
}

export async function enviarTextoChatwoot(telefone: string, texto: string, nome?: string): Promise<void> {
  const accountId = config.chatwootAccountId;
  const convId = await garantirConversaChatwootMeta(telefone, nome);
  const res = await chatwootFetch(
    `/api/v1/accounts/${accountId}/conversations/${convId}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({
        content: texto,
        message_type: 'outgoing',
        private: false,
      }),
    },
  );
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Chatwoot send ${res.status}: ${t.slice(0, 240)}`);
  }
}
