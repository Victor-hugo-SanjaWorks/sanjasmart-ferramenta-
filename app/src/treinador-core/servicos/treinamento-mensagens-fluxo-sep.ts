/**
 * Separador explicito para arrays de mensagens_fluxo (F4.2).
 * Evita split cego por \\n que corrompe mensagens multi-linha.
 */
export const SEP_MSG_FLUXO = '<<<MSG>>>';

/** Junta itens de array preservando quebras internas de cada mensagem. */
export function juntarMensagensFluxo(itens: unknown[]): string {
  return itens
    .map((i) => String(i ?? '').trim())
    .filter(Boolean)
    .join(`\n${SEP_MSG_FLUXO}\n`);
}

/**
 * Reconstroi array a partir do texto editado.
 * Prefere SEP; se so havia 1 item, nao parte por linha; senao usa \\n\\n.
 */
export function partirMensagensFluxo(
  texto: string,
  valorOriginal: unknown,
): string[] {
  const t = String(texto ?? '');
  if (t.includes(SEP_MSG_FLUXO)) {
    return t
      .split(/\n?<<<MSG>>>\n?/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (Array.isArray(valorOriginal) && valorOriginal.length <= 1) {
    return t.trim() ? [t.trim()] : [];
  }
  return t
    .split(/\n\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
