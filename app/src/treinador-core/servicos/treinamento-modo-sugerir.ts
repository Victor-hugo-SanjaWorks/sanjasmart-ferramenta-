/**
 * Modo so-sugerir: conversa e analisa, mas nunca cria/aplica patch (F4.11 / C#33).
 * Motivo: treino "seguro" para operadores que so podem pedir opiniao.
 * Flag via env TREINADOR_MODO_SO_SUGERIR=1 ou opts.modoSoSugerir.
 */
const TOOLS_BLOQUEADAS = new Set([
  'propor_patch',
  'aplicar_patch',
  'propor_aprendizado',
  'confirmar_aprendizado',
  'cancelar_patch',
  'cancelar_aprendizado',
  'reverter_patch',
  'restaurar_versao',
  'aplicar_staging',
  'promover_staging',
]);

export function modoSoSugerirAtivo(opts?: { modoSoSugerir?: boolean }): boolean {
  if (opts?.modoSoSugerir === true) return true;
  if (opts?.modoSoSugerir === false) return false;
  const v = String(process.env.TREINADOR_MODO_SO_SUGERIR || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'sim' || v === 'on';
}

export function filtrarToolsModoSugerir<T extends { function?: { name?: string } }>(
  tools: T[],
): T[] {
  return tools.filter((t) => !TOOLS_BLOQUEADAS.has(String(t.function?.name || '')));
}

export function toolBloqueadaNoModoSugerir(nome: string): boolean {
  return TOOLS_BLOQUEADAS.has(String(nome || '').trim());
}

export function msgModoSoSugerir(): string {
  return (
    'Aqui eu posso analisar e sugerir melhorias, mas nao publicar mudancas de verdade. ' +
    'Se voce quiser aplicar algo, chame alguem com permissao para isso.'
  );
}
