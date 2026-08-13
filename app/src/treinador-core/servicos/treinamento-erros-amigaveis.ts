/**
 * Traduz erros tecnicos do treinador para mensagem clara ao operador.
 * Fecha F1.6: explicar POR QUE recusou e evitar jargao (trechoAtual/JSON/hash).
 * Usado em tool-runner seguro e nas recusas de propor/aplicar.
 */

export type ErroAmigavel = {
  mensagem: string;
  porque: string;
  comoResolver: string;
};

type Regra = {
  match: RegExp;
  mensagem: string;
  porque: string;
  comoResolver: string;
};

const REGRAS: Regra[] = [
  {
    match: /trechoAtual nao foi encontrado|nao foi encontrado no alvo/i,
    mensagem: 'Nao achei o trecho que voce quer trocar no texto atual.',
    porque: 'O texto do alvo mudou ou o trecho proposto nao bate letra a letra.',
    comoResolver:
      'Peca para ler o alvo de novo e use um trecho unico copiado do texto atual (ou os trechos proximos sugeridos).',
  },
  {
    match: /aparece \d+ vezes|refine o trecho/i,
    mensagem: 'O trecho aparece mais de uma vez — a troca ficaria ambigua.',
    porque: 'Trocar um trecho repetido alteraria varios pontos sem querer.',
    comoResolver: 'Amplie o trecho com mais contexto ate ficar unico.',
  },
  {
    match: /mudou desde a proposta|lock|hash/i,
    mensagem: 'O texto mudou desde que preparei essa sugestao.',
    porque: 'Alguma outra alteracao aconteceu antes de voce confirmar.',
    comoResolver: 'Me peca para montar uma nova sugestao em cima da versao mais recente.',
  },
  {
    match: /outro autor/i,
    mensagem: 'Essa mudanca foi preparada por outra pessoa e eu nao posso confirmar por voce.',
    porque: 'So quem pediu a mudanca, ou o mesmo login do painel, pode finalizar essa etapa.',
    comoResolver: 'Peca para a pessoa que iniciou confirmar, ou me peca para montar a sua propria sugestao.',
  },
  {
    match: /confirmacao dupla|replace total/i,
    mensagem: 'Trocar esse bloco inteiro de texto exige uma confirmacao extra.',
    porque: 'E uma mudanca grande e eu prefiro ter certeza antes de publicar.',
    comoResolver: 'Confirme de forma bem clara que quer substituir tudo.',
  },
  {
    match: /prompt-injection|injection/i,
    mensagem: 'Bloqueei esse pedido por parecer uma tentativa de burlar as regras.',
    porque: 'O texto tenta mexer nas instrucoes do treinador, e nao so no comportamento da IA.',
    comoResolver: 'Me diga apenas o que voce quer que a IA passe a fazer, em linguagem normal.',
  },
  {
    match: /nao esta pendente|ja foi encerrado/i,
    mensagem: 'Essa sugestao ja nao esta mais esperando confirmacao.',
    porque: 'Ela ja foi publicada, descartada ou desfeita.',
    comoResolver: 'Se precisar, eu monto uma nova sugestao para voce.',
  },
  {
    match: /JSON|json malformado|sem objeto JSON|truncado/i,
    mensagem: 'A IA devolveu uma proposta incompleta ou ilegivel.',
    porque: 'Falha ao interpretar a estrutura da resposta do modelo.',
    comoResolver: 'Tente de novo com um pedido mais curto e concreto.',
  },
  {
    match: /textoProposto|texto proposto e obrigatorio/i,
    mensagem: 'Falta o texto novo para aplicar a mudanca.',
    porque: 'A proposta veio sem o conteudo de substituicao.',
    comoResolver: 'Descreva claramente o que a IA deve passar a dizer.',
  },
  {
    match: /muito curto|pelo menos \d+ caracteres/i,
    mensagem: 'Pedido curto demais para treinar com seguranca.',
    porque: 'Sem contexto minimo da mudanca desejada.',
    comoResolver: 'Explique o erro atual e como deveria responder.',
  },
  {
    match: /chave.*(obrigatoria|orquestracao|fluxo)/i,
    mensagem: 'Falta indicar qual mensagem/chave editar.',
    porque: 'Esse alvo tem varias chaves; sem a certa a edicao e arriscada.',
    comoResolver: 'Peca sugestao de chave ou diga o nome da mensagem de fluxo.',
  },
  {
    match: /Alvo invalido|Tool desconhecida/i,
    mensagem: 'Nao reconheci essa operacao do jeito que ela foi pedida.',
    porque: 'Esse tipo de ajuste nao esta disponivel nesta versao do treinador.',
    comoResolver: 'Me descreva a mudanca em linguagem natural que eu tento te guiar por outro caminho.',
  },
];

/** Remove jargao interno que nao ajuda o operador humano. */
export function sanitizarJargao(texto: string): string {
  return String(texto || '')
    .replace(/\btrechoAtual\b/gi, 'trecho a trocar')
    .replace(/\btextoProposto\b/gi, 'texto novo')
    .replace(/\bhash\b/gi, 'assinatura')
    .replace(/\bJSON\b/g, 'estrutura da resposta')
    .replace(/\bTOCTOU\b/gi, 'condicao de corrida')
    .replace(/\bpatch\b/gi, 'mudanca')
    .replace(/\bstaging\b/gi, 'ensaio')
    .replace(/\bprompt_sistema\b/gi, 'texto principal')
    .trim();
}

/** Converte mensagem bruta em erro amigavel com porque + como resolver. */
export function amigavelizarErro(bruto: string): ErroAmigavel {
  const raw = String(bruto || '').trim() || 'Falha desconhecida no treinador';
  for (const r of REGRAS) {
    if (r.match.test(raw)) {
      return {
        mensagem: r.mensagem,
        porque: r.porque,
        comoResolver: r.comoResolver,
      };
    }
  }
  return {
    mensagem: sanitizarJargao(raw),
    porque: 'A operacao nao pôde ser concluida com os dados atuais.',
    comoResolver: 'Ajuste o pedido ou leia o alvo de novo e tente outra proposta.',
  };
}

/** Formata bloco curto para o agente/WhatsApp/painel. */
export function formatarErroAmigavel(bruto: string): string {
  const e = amigavelizarErro(bruto);
  return `${e.mensagem}\nPor que: ${e.porque}\nComo resolver: ${e.comoResolver}`;
}
