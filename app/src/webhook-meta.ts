/**
 * Webhook da WhatsApp Cloud API (Meta) — um App Meta por tenant.
 * GET  /webhook/meta  handshake hub.challenge
 * POST /webhook/meta  mensagens (assinadas com o App Secret do tenant)
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { config } from './config.js';
import { chatwootFetch } from './chatwoot-sync.js';
import { adicionarAoDebounce, tentarComandoRecomecarAtendimento } from './debounce-minasplaca.js';
import { iaEstaPausada } from './pausa-minasplaca.js';
import { linhaTemLicencaIa } from './licenca-ia.js';
import { marcarMensagemNova } from './lib/msg-dedupe.js';
import type { ItemDebounce } from './lib/tipos.js';

/**
 * A Meta assina o corpo com HMAC-SHA256 do App Secret. Sem isso qualquer um
 * que descubra a URL injeta mensagem falsa na fila da IA e no Chatwoot.
 */
function assinaturaConfere(bruto: Buffer | string, header?: string): boolean {
  const segredo = config.metaAppSecret;
  if (!segredo) return false;
  if (!header?.startsWith('sha256=')) return false;

  const esperado = createHmac('sha256', segredo)
    .update(typeof bruto === 'string' ? Buffer.from(bruto, 'utf8') : bruto)
    .digest('hex');
  const recebido = header.slice('sha256='.length).trim();
  if (recebido.length !== esperado.length) return false;
  return timingSafeEqual(Buffer.from(recebido, 'utf8'), Buffer.from(esperado, 'utf8'));
}

export async function rotasWebhookMeta(app: FastifyInstance): Promise<void> {
  app.get('/webhook/meta', async (req, reply) => {
    const query = req.query as {
      'hub.mode'?: string;
      'hub.verify_token'?: string;
      'hub.challenge'?: string;
    };

    const esperado = config.metaVerifyToken;
    if (!esperado) {
      console.warn('[webhook-meta] META_VERIFY_TOKEN nao configurado — handshake recusado');
      return reply.status(503).send('verify token nao configurado');
    }

    if (query['hub.mode'] === 'subscribe' && query['hub.verify_token'] === esperado) {
      console.log('[webhook-meta] webhook verificado pelo Meta');
      return reply.status(200).send(Number(query['hub.challenge']));
    }

    console.warn('[webhook-meta] handshake recusado: token invalido');
    return reply.status(403).send('Forbidden');
  });

  app.post('/webhook/meta', async (req, reply) => {
    const bruto = (req as { rawBody?: Buffer | string }).rawBody;
    const assinatura = req.headers['x-hub-signature-256'] as string | undefined;

    if (bruto == null) {
      console.error('[webhook-meta] rawBody ausente — nao da para validar assinatura');
      return reply.status(500).send({ ok: false });
    }
    if (!assinaturaConfere(bruto, assinatura)) {
      console.warn('[webhook-meta] POST recusado: assinatura invalida');
      return reply.status(401).send({ ok: false });
    }

    // Responde antes de processar: o timeout da Meta e curto e ela reenvia.
    reply.status(200).send({ ok: true, processado: true });

    try {
      const payload = req.body as any;
      if (payload?.object !== 'whatsapp_business_account' || !payload.entry) return;

      for (const entry of payload.entry) {
        for (const change of entry.changes || []) {
          if (change.field !== 'messages') continue;

          const val = change.value;
          if (!val?.messages?.length) continue;

          for (const msg of val.messages) {
            if (msg.type !== 'text' || !msg.text?.body) continue;

            const messageId = msg.id;
            if (!(await marcarMensagemNova(messageId))) {
              console.log(`[webhook-meta] ${messageId} duplicada — ignorada`);
              continue;
            }

            const telefone = msg.from;
            if (!telefone) continue;

            const conteudo = String(msg.text.body).trim();
            if (!conteudo) continue;

            const pushName =
              val.contacts?.find((c: any) => c.wa_id === msg.from)?.profile?.name || 'Contato';

            if (config.chatwootMetaInboxId) {
              enviarParaChatwoot(telefone, pushName, conteudo).catch((err) => {
                console.error('[webhook-meta] erro ao espelhar no Chatwoot:', err);
              });
            }

            const instance = config.metaInstanceName;
            if (await tentarComandoRecomecarAtendimento(telefone, conteudo, 'meta')) {
              continue;
            }
            if (!(await linhaTemLicencaIa(instance))) {
              console.log(`[webhook-meta] sem licenca IA na linha ${instance}`);
              continue;
            }
            if (await iaEstaPausada(telefone)) {
              console.log(`[webhook-meta] IA pausada para ${telefone} — ignorada`);
              continue;
            }

            await adicionarAoDebounce({
              remoteJid: `${telefone}@s.whatsapp.net`,
              telefone,
              conteudo,
              tipo: 'texto',
              pushName,
              instance,
              midiaId: messageId,
              recebidoEm: Date.now(),
            } as ItemDebounce);
          }
        }
      }
    } catch (err) {
      console.error('[webhook-meta] erro ao processar payload:', err);
    }
  });
}

async function enviarParaChatwoot(telefone: string, nome: string, texto: string): Promise<void> {
  const accountId = config.chatwootAccountId;
  const inboxId = config.chatwootMetaInboxId;
  const phoneFormated = `+${telefone}`;

  const cRes = await chatwootFetch(
    `/api/v1/accounts/${accountId}/contacts/search?q=${encodeURIComponent(phoneFormated)}`,
  );
  const cData = (await cRes.json()) as any;
  let contactId = cData.payload?.length ? cData.payload[0].id : null;

  if (!contactId) {
    const cCreate = await chatwootFetch(`/api/v1/accounts/${accountId}/contacts`, {
      method: 'POST',
      body: JSON.stringify({ phone_number: phoneFormated, name: nome }),
    });
    const cCreateData = (await cCreate.json()) as any;
    contactId = cCreateData.payload.contact.id;
  }

  const convRes = await chatwootFetch(
    `/api/v1/accounts/${accountId}/contacts/${contactId}/conversations`,
  );
  const convData = (await convRes.json()) as any;
  const conv = convData.payload?.find((c: any) => c.inbox_id === inboxId) ?? null;
  let convId = conv ? conv.id : null;

  if (!convId) {
    const convCreate = await chatwootFetch(`/api/v1/accounts/${accountId}/conversations`, {
      method: 'POST',
      body: JSON.stringify({ inbox_id: inboxId, contact_id: contactId, source_id: phoneFormated }),
    });
    const convCreateData = (await convCreate.json()) as any;
    convId = convCreateData.id;
  }

  await chatwootFetch(`/api/v1/accounts/${accountId}/conversations/${convId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content: texto, message_type: 'incoming' }),
  });
}
