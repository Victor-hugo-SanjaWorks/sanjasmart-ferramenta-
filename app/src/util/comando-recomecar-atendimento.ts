/**
 * Comando de sistema (exato, trim) — zera histórico daquele chat para a IA recomeçar.
 * Não é gate por produto: uma classe só, mesma string em toda a frota.
 */
export const CMD_RECOMECAR_ATENDIMENTO = '####$#!$#recomeçar-atendimento';

export function mensagemEhComandoRecomecar(texto: string): boolean {
  return String(texto || '').trim() === CMD_RECOMECAR_ATENDIMENTO;
}

/** True se alguma bolha do lote (debounce) for o comando exato. */
export function loteTemComandoRecomecar(textos: string[]): boolean {
  return textos.some((t) => mensagemEhComandoRecomecar(t));
}
