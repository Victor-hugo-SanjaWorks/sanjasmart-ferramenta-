/**
 * Nome seguro da colecao Qdrant do treinador (F4.8 / C#43).
 * Motivo: nunca compartilhar a colecao do RAG do cliente com o catalogo editavel.
 * Puro — testavel sem Qdrant.
 */
export function resolverColecaoTreinamento(opts: {
  colecaoTreinamento?: string;
  colecaoRag?: string;
  appSlug?: string;
}): string {
  const rag = String(opts.colecaoRag || '').trim();
  let nome = String(opts.colecaoTreinamento || '').trim();
  if (!nome) {
    const slug =
      String(opts.appSlug || 'app')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '_')
        .replace(/^_|_$/g, '') || 'app';
    nome = `${slug}_treinador_config`;
  }
  if (rag && nome === rag) {
    nome = `${nome}_treinador`;
  }
  return nome;
}
