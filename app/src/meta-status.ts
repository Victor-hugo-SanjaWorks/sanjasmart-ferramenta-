/**
 * Saúde da linha WhatsApp Cloud API (Meta) / inbox Chatwoot.
 */
import { config } from './config.js';
import { obterMetaConfig } from './meta-config.js';

export type MetaStatus = {
  configured: boolean;
  connected: boolean;
  provider: 'meta';
  instanceName: string;
  telefone: string | null;
  profileName: string | null;
  phone_number_id: string | null;
  token_ok: boolean;
  inbox_id: number | null;
  inbox_ok: boolean;
  detalhe?: string;
};

export function metaEnvConfigurado(): boolean {
  return Boolean(
    (config.metaInstanceName || '').trim()
    || (config.metaPhoneNumberId || '').trim()
    || (config.metaAccessToken || '').trim()
    || (config.chatwootMetaInboxId || '').trim(),
  );
}

export async function obterStatusMeta(): Promise<MetaStatus> {
  const instanceName = (config.metaInstanceName || `${config.appSlug || 'app'}-meta`).trim();
  const inboxRaw = config.chatwootMetaInboxId;
  const inbox_id =
    typeof inboxRaw === 'number'
      ? inboxRaw
      : inboxRaw
        ? Number(inboxRaw)
        : null;
  const inbox_ok = Boolean(inbox_id && Number.isFinite(inbox_id) && inbox_id > 0);

  const meta = await obterMetaConfig();
  const phoneId = (meta.phoneId || '').trim();
  const token = (meta.accessToken || '').trim();

  if (!phoneId || !token) {
    return {
      configured: inbox_ok,
      connected: inbox_ok,
      provider: 'meta',
      instanceName,
      telefone: null,
      profileName: null,
      phone_number_id: phoneId || null,
      token_ok: false,
      inbox_id: inbox_ok ? inbox_id : null,
      inbox_ok,
      detalhe: inbox_ok
        ? 'inbox Chatwoot Cloud API'
        : 'META_ACCESS_TOKEN / META_PHONE_NUMBER_ID ausentes',
    };
  }

  try {
    const url =
      `https://graph.facebook.com/v20.0/${encodeURIComponent(phoneId)}` +
      `?fields=display_phone_number,verified_name,quality_rating`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(12_000),
    });
    const body = (await res.json().catch(() => ({}))) as {
      display_phone_number?: string;
      verified_name?: string;
      error?: { message?: string };
    };
    if (res.ok) {
      const display = String(body.display_phone_number || '').replace(/\D/g, '');
      return {
        configured: true,
        connected: true,
        provider: 'meta',
        instanceName,
        telefone: display || null,
        profileName: body.verified_name || null,
        phone_number_id: phoneId,
        token_ok: true,
        inbox_id: inbox_ok ? inbox_id : null,
        inbox_ok,
      };
    }

    const meRes = await fetch('https://graph.facebook.com/v20.0/me?fields=id,name', {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    const me = (await meRes.json().catch(() => ({}))) as { id?: string; name?: string };
    if (meRes.ok && me.id) {
      return {
        configured: true,
        connected: true,
        provider: 'meta',
        instanceName,
        telefone: null,
        profileName: me.name || null,
        phone_number_id: phoneId,
        token_ok: true,
        inbox_id: inbox_ok ? inbox_id : null,
        inbox_ok,
        detalhe: body.error?.message
          ? `perfil do numero indisponivel (${body.error.message.slice(0, 80)})`
          : undefined,
      };
    }

    return {
      configured: true,
      connected: inbox_ok,
      provider: 'meta',
      instanceName,
      telefone: null,
      profileName: null,
      phone_number_id: phoneId,
      token_ok: false,
      inbox_id: inbox_ok ? inbox_id : null,
      inbox_ok,
      detalhe: body.error?.message || `Graph HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      configured: true,
      connected: inbox_ok,
      provider: 'meta',
      instanceName,
      telefone: null,
      profileName: null,
      phone_number_id: phoneId,
      token_ok: false,
      inbox_id: inbox_ok ? inbox_id : null,
      inbox_ok,
      detalhe: err instanceof Error ? err.message : String(err),
    };
  }
}
