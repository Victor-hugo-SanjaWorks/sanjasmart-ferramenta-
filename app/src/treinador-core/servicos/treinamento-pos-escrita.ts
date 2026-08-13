/**
 * Confirma que o texto gravado bate com o "depois" esperado.
 * Detecta apply que marcou aprovado mas o host nao persistiu de verdade.
 * Usado apos salvarTextoAtualizado / aplicarPatchTreinamento.
 */
export async function verificarPosEscrita(opts: {
  esperado: string;
  lerAtual: () => Promise<string>;
  rotulo?: string;
}): Promise<void> {
  const atual = String(await opts.lerAtual());
  const esperado = String(opts.esperado ?? '');
  if (atual === esperado) return;
  const rotulo = opts.rotulo || 'alvo';
  throw new Error(
    `Pos-escrita falhou em ${rotulo}: gravado (${atual.length} chars) != esperado (${esperado.length} chars)`,
  );
}
