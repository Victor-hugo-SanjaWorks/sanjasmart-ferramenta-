/**
 * Constantes Qdrant do catalogo vetorial do treinador.
 * Busca lexical no agente continua mesmo sem embedding.
 */
export const DIMENSAO = 1536;

export async function buscarPontosSimilares(
  _colecao: string,
  _vector: number[],
  _limite = 5,
): Promise<Array<{ payload?: Record<string, unknown>; score?: number }>> {
  return [];
}
