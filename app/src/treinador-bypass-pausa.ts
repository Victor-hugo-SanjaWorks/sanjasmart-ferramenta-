/**
 * Helper: inbound WhatsApp — treinador autorizado passa mesmo com IA pausada.
 * Cliente final continua sujeito a licença + pausa global/contato/linha.
 */
export async function telefoneEhTreinador(telefone: string): Promise<boolean> {
  try {
    const { telefoneAutorizadoTreinamento } = await import(
      './treinador-core/servicos/treinamento-whatsapp.js'
    );
    return await telefoneAutorizadoTreinamento(telefone);
  } catch {
    try {
      const { telefoneAutorizadoTreinador } = await import('./treinador-whatsapp-auth.js');
      return await telefoneAutorizadoTreinador(telefone);
    } catch {
      return false;
    }
  }
}
