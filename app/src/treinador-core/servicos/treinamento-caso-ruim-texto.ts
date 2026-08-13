/**
 * Monta o texto de treino a partir de um caso real "IA errou aqui" (F3.2).
 * Puro — sem I/O — para testar o formato que alimenta propor_patch.
 */
export type CasoRuimEntrada = {
  telefoneCliente?: string;
  mensagemCliente?: string;
  respostaIa?: string;
  respostaEsperada?: string;
  observacao?: string;
};

export function montarInstrucaoCasoRuim(c: CasoRuimEntrada): string {
  const partes = [
    'A IA errou neste atendimento. Corrija o comportamento no prompt ou mensagens_fluxo.',
    '',
  ];
  if (c.telefoneCliente) partes.push(`Telefone do cliente: ${c.telefoneCliente}`);
  if (c.mensagemCliente) partes.push(`Cliente disse:\n${c.mensagemCliente.trim()}`);
  if (c.respostaIa) partes.push(`IA respondeu (errado):\n${c.respostaIa.trim()}`);
  if (c.respostaEsperada) {
    partes.push(`Resposta correta esperada:\n${c.respostaEsperada.trim()}`);
  }
  if (c.observacao) partes.push(`Observacao do atendente:\n${c.observacao.trim()}`);
  partes.push(
    '',
    'Faca um patch cirurgico para que, na proxima vez, a IA responda como o esperado.',
    'Nao invente marca/produto. Prefira mensagens_fluxo se for saudacao/mensagem fixa.',
  );
  return partes.filter((p) => p != null).join('\n').trim();
}

export function casoRuimTemConteudoMinimo(c: CasoRuimEntrada): boolean {
  const ia = String(c.respostaIa || '').trim();
  const esp = String(c.respostaEsperada || '').trim();
  const obs = String(c.observacao || '').trim();
  return ia.length >= 5 || esp.length >= 5 || obs.length >= 10;
}
