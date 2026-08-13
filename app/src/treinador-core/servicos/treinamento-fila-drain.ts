/**
 * Detecta "processar fila" e escolhe o texto a retomar (F4.9).
 * Motivo: admin nao precisa reescrever o pedido que falhou no LLM.
 * Puro o suficiente para testar sem Postgres (so helpers de texto).
 */

export function ehPedidoProcessarFila(texto: string): boolean {
  return /^(processar\s*fila|continua(r)?(\s+fila)?|retomar\s*fila|oi[,! ]+e\s+aquilo|conseguiu\s+ver|pode\s+retomar|segue\s+com\s+aquilo)\b/i.test(
    String(texto || '').trim(),
  );
}

export function prefixoRetomadaFila(id: number): string {
  void id;
  return `Consegui retomar aquele pedido que tinha ficado pendente.\n\n`;
}

export function msgFilaVazia(): string {
  return 'Nao achei nenhum pedido pendente por aqui. Se quiser, me manda de novo o que voce quer ajustar.';
}

/** Se a resposta indica que o LLM caiu de novo, o item deve continuar pendente. */
export function respostaIndicaFilaDeNovo(resposta: string): boolean {
  return /anotei seu pedido|guardei o seu pedido|conexao.*instavel|retomo assim que|pedido ficou guardado/i.test(
    String(resposta || ''),
  );
}
