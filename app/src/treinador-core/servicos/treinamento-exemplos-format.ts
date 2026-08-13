/**
 * Formata exemplos ruim→bom para few-shot do treinador (F3.3).
 * Puro — a persistencia fica em treinamento-exemplos-store.ts.
 */
export type ExemploTreino = {
  id?: number;
  ruim: string;
  bom: string;
  contexto?: string;
  tags?: string[];
};

export function formatarExemplosFewShot(exemplos: ExemploTreino[], limite = 5): string {
  const lista = (exemplos || []).slice(0, Math.max(1, limite));
  if (!lista.length) return '';
  const blocos = lista.map((e, i) => {
    const ctx = e.contexto ? `\nContexto: ${String(e.contexto).slice(0, 200)}` : '';
    return (
      `Exemplo ${i + 1}:${ctx}\n` +
      `RUIM:\n${String(e.ruim).slice(0, 400)}\n` +
      `BOM:\n${String(e.bom).slice(0, 400)}`
    );
  });
  return (
    '=== EXEMPLOS RUIM→BOM DESTE APP (few-shot) ===\n' +
    'Use como referencia de tom/conteudo ao propor patches — nao copie cego.\n\n' +
    blocos.join('\n\n')
  );
}
