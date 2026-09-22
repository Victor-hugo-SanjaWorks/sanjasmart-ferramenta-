/**
 * Captura mensagens do atendente (Chatwoot / celular) no histórico da IA.
 * Marca saídas da própria IA para não gravar o eco fromMe como “humano”.
 */
import { createHash } from 'node:crypto';
import { obterRedis } from './lib/redis.js';
import { adicionarAoHistorico } from './historico-minasplaca.js';
import { definirPausa, iaEstaPausada } from './pausa-minasplaca.js';
import { canonizarTelefoneBr, normalizarTelefone } from './util/telefone.js';

const TTL_SAIDA_IA_SEC = 180;
const TTL_DEDUP_ATEND_SEC = 90;
const PREFIXO_SAIDA = 'ia:saida:';
const PREFIXO_DEDUP = 'atend:dedup:';
const PREFIXO_LISTA = 'debounce:lista:';
const PREFIXO_TIMER = 'debounce:timer:';

function normalizarTexto(texto: string): string {
  return String(texto || '').replace(/\s+/g, ' ').trim();
}

function fingerprint(telefone: string, texto: string): string {
  const base = `${canonizarTelefoneBr(telefone)}|${normalizarTexto(texto).slice(0, 240)}`;
  return createHash('sha1').update(base).digest('hex').slice(0, 24);
}

/** Chamar antes/ao enviar cada fragmento WhatsApp da IA. */
export async function marcarSaidaIa(telefone: string, texto: string): Promise<void> {
  const t = normalizarTexto(texto);
  if (!t || !telefone) return;
  const redis = obterRedis();
  await redis.set(`${PREFIXO_SAIDA}${fingerprint(telefone, t)}`, '1', 'EX', TTL_SAIDA_IA_SEC);
}

export async function foiSaidaIaRecente(telefone: string, texto: string): Promise<boolean> {
  const t = normalizarTexto(texto);
  if (!t || !telefone) return false;
  const redis = obterRedis();
  return Boolean(await redis.get(`${PREFIXO_SAIDA}${fingerprint(telefone, t)}`));
}

async function limparFilaDebounce(telefone: string): Promise<void> {
  const redis = obterRedis();
  const tel = canonizarTelefoneBr(telefone);
  await redis.del(`${PREFIXO_LISTA}${tel}`, `${PREFIXO_TIMER}${tel}`);
}

/**
 * Grava fala do humano no histórico. Se a IA ainda estiver ligada, pausa
 * para não responder por cima do atendente.
 */
export async function registrarMsgAtendente(opts: {
  telefone: string;
  texto: string;
  origem: string;
  autoPausar?: boolean;
}): Promise<{ ok: boolean; motivo?: string; pausada?: boolean }> {
  const texto = normalizarTexto(opts.texto);
  const telefone = canonizarTelefoneBr(opts.telefone);
  if (!telefone || !texto) return { ok: false, motivo: 'sem_dados' };

  if (await foiSaidaIaRecente(telefone, texto)) {
    return { ok: false, motivo: 'eco_saida_ia' };
  }

  const redis = obterRedis();
  const dedupKey = `${PREFIXO_DEDUP}${fingerprint(telefone, texto)}`;
  const primeira = await redis.set(dedupKey, '1', 'EX', TTL_DEDUP_ATEND_SEC, 'NX');
  if (primeira !== 'OK') return { ok: false, motivo: 'duplicada' };

  await adicionarAoHistorico(telefone, [
    { role: 'atendente', content: texto, timestamp: Date.now() },
  ]);

  let pausada = false;
  const auto = opts.autoPausar === true;
  if (auto && !(await iaEstaPausada(telefone))) {
    await definirPausa(telefone, true, {
      motivo: 'Atendente enviou mensagem',
      origem: opts.origem,
      status: 'open',
    });
    // import dinâmico evita ciclo: followup → evolution → marcarSaidaIa
    const { cancelarFollowup } = await import('./followup-minasplaca.js');
    await cancelarFollowup(telefone).catch(() => {});
    await limparFilaDebounce(telefone).catch(() => {});
    pausada = true;
  }

  console.log(
    `[historico-atendente] registrado (${opts.origem}) tel=${telefone} pausada=${pausada} txt=${texto.slice(0, 60)}`,
  );
  return { ok: true, pausada };
}

/** Extrai texto outgoing de agent no webhook Chatwoot (message_created). */
export function extrairMsgAtendenteChatwoot(
  payload: Record<string, unknown>,
): { telefone: string; texto: string } | null {
  const evento = String(payload.event ?? '').toLowerCase();
  if (evento && evento !== 'message_created') return null;

  if (payload.private === true) return null;

  const messageType = payload.message_type ?? payload.messageType;
  const outgoing =
    messageType === 'outgoing' ||
    messageType === 1 ||
    messageType === '1';
  if (!outgoing) return null;

  const sender = (payload.sender ?? {}) as Record<string, unknown>;
  const senderType = String(sender.type ?? payload.sender_type ?? '').toLowerCase();
  // Bot / API da própria conta — eco da IA via Chatwoot
  if (senderType === 'agent_bot' || senderType === 'AgentBot'.toLowerCase()) return null;

  const texto = normalizarTexto(String(payload.content ?? payload.processed_message_content ?? ''));
  if (!texto) return null;

  const conversation = (payload.conversation ?? {}) as Record<string, unknown>;
  const meta = (conversation.meta ?? {}) as Record<string, unknown>;
  const metaSender = (meta.sender ?? {}) as Record<string, unknown>;
  const contact = (payload.contact ?? conversation.contact ?? {}) as Record<string, unknown>;

  const bruto =
    metaSender.phone_number ??
    metaSender.identifier ??
    contact.phone_number ??
    contact.identifier ??
    payload.telefone;
  const telefone = normalizarTelefone(String(bruto ?? ''));
  if (!telefone || telefone.length < 10) return null;

  return { telefone, texto };
}
