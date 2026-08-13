/**
 * Stub: orquestracao_texto indisponivel na frota SaaS.
 */
export type ConfigOrquestracaoTexto = Record<string, unknown>;
export async function obterConfigOrquestracaoTexto(): Promise<ConfigOrquestracaoTexto> {
  return {};
}
export async function salvarConfigOrquestracaoTexto(
  _c: ConfigOrquestracaoTexto,
  _origem?: string,
): Promise<void> {
  throw new Error('Alvo orquestracao_texto indisponivel neste app — use prompt_sistema');
}
