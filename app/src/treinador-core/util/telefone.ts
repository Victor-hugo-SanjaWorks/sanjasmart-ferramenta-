/**
 * Normalizacao de telefone WhatsApp / Chatwoot.
 *
 * Existe para unificar o MESMO contato salvo em formatos diferentes (com/sem o
 * "9" do celular, com/sem DDI 55). Sem isso, uma mensagem proativa salva como
 * 55+DDD+9+numero nao casa com a resposta que o WhatsApp entrega sem o 9, o
 * historico vem vazio e a IA "recomeca" o atendimento. As variantes garantem
 * que a busca do historico encontre o contato independente do formato salvo.
 */

/** Apenas dígitos (ex: 5511999999999) */
export function normalizarTelefone(valor: string): string {
  let d = valor.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  return d;
}

/**
 * Formato canônico BR para histórico/disparos (55 + DDD + 9 dígitos móvel).
 * Unifica variantes com/sem o 9 após o DDD (ex: 553172261284 ↔ 5531972261284).
 */
export function canonizarTelefoneBr(valor: string): string {
  let d = normalizarTelefone(valor);
  if (!d) return d;

  // Sem DDI: recebe DDD + numero (10 = fixo/8dig, 11 = celular/9dig) e prefixa 55.
  if (!d.startsWith('55') && (d.length === 10 || d.length === 11)) {
    d = `55${d}`;
  }

  // Com DDI 55 e 12 digitos (55 + DDD + 8) = celular sem o 9. Insere o 9 para
  // unificar no formato canonico de 13 digitos (55 + DDD + 9 + 8). Fixos (local
  // iniciando em 2-5) permanecem sem o 9.
  if (d.startsWith('55') && d.length === 12) {
    const ddd = d.slice(2, 4);
    const local = d.slice(4);
    if (/^[6-9]/.test(local)) {
      d = `55${ddd}9${local}`;
    }
  }

  return d;
}

/** Variantes do mesmo numero (com e sem o 9) para busca no historico. */
export function variantesTelefoneBr(valor: string): string[] {
  const base = normalizarTelefone(valor);
  const canon = canonizarTelefoneBr(valor);
  const set = new Set<string>();
  if (base) set.add(base);
  if (canon) set.add(canon);

  // Celular canonico (13 = 55 + DDD + 9 + 8) tambem gera a forma sem o 9 (12),
  // porque o WhatsApp entrega alguns numeros (ex: DDDs de MG) sem o 9.
  if (canon.startsWith('55') && canon.length === 13) {
    const ddd = canon.slice(2, 4);
    const local = canon.slice(5);
    set.add(`55${ddd}${local}`);
  }

  return [...set].filter(Boolean);
}

/** Contato individual plausível para monitor/disparo */
export function telefoneEhContatoValido(valor: string): boolean {
  const telefone = normalizarTelefone(valor);
  return telefone.length >= 10 && telefone.length <= 15;
}

/** remoteJid a partir de telefone */
export function telefoneParaJid(telefone: string): string {
  const n = normalizarTelefone(telefone);
  return `${n}@s.whatsapp.net`;
}

/** Identifica grupo/lista/broadcast no WhatsApp. */
export function jidEhGrupoOuLista(remoteJid: string | undefined | null): boolean {
  const jid = String(remoteJid ?? '').toLowerCase().trim();
  return jid.endsWith('@g.us') || jid.endsWith('@broadcast') || jid.includes('@newsletter');
}

/** Telefone a partir de remoteJid */
export function jidParaTelefone(remoteJid: string): string {
  return normalizarTelefone(remoteJid.split('@')[0] ?? remoteJid);
}
