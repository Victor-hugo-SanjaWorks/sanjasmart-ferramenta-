/**
 * Stub: mensagens_fluxo nao existe na frota — so prompt_sistema.
 */
export type ConfigMensagensFluxo = Record<string, unknown>;
export async function obterConfigMensagensFluxo(): Promise<ConfigMensagensFluxo> {
  return {};
}
export async function salvarConfigMensagensFluxo(
  _c: ConfigMensagensFluxo,
  _origem?: string,
): Promise<void> {
  throw new Error('Alvo mensagens_fluxo indisponivel neste app — use prompt_sistema');
}
