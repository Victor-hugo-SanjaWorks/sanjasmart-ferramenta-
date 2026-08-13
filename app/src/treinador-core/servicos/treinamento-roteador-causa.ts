/**
 * Roteia a causa do pedido de treino: prompt, RAG, codigo ou config de modelo.
 * Evita o treinador editar prompt quando o comportamento vem de outro lugar.
 * Usado pela tool rotear_causa e no fluxo antes de propor_patch.
 */
export type CausaTreinamento =
  | 'prompt'
  | 'rag'
  | 'codigo'
  | 'config_modelo'
  | 'ambiguo';

export type DecisaoCausa = {
  causa: CausaTreinamento;
  motivo: string;
  recomendacao: string;
  podeEditarComTreinador: boolean;
};

const RAG =
  /(base\s+de\s+conhec|conhecimento|documento|pdf|rag|faq|manual|planilha|arquivo\s+indexad|busca\s+sem[aâ]ntica|qdrant)/i;
const CODIGO =
  /(roteamento|transfer(ir|encia)|pausar?\s+ia|webhook|tool\s+call|integracao|api\s+externa|assignee|crm|codigo|deploy|feature\s+flag)/i;
const MODELO =
  /(mais\s+r[aá]pido|mais\s+curto|max_?tokens|temperatura|modelo\s+(gpt|claude|llm)|lat[eê]ncia|custo\s+de\s+token)/i;
const PROMPT =
  /(prompt|saudac|tom|mensagem|boas\s*vind|falar\s+assim|responder\s+assim|nunca\s+diga|sempre\s+diga|persona|instruc)/i;

export function rotearCausaPedido(pedido: string): DecisaoCausa {
  const t = String(pedido || '').trim();
  if (t.length < 3) {
    return {
      causa: 'ambiguo',
      motivo: 'Pedido vazio ou curto demais.',
      recomendacao: 'Descreva o comportamento errado e o que deveria acontecer.',
      podeEditarComTreinador: false,
    };
  }

  const temRag = RAG.test(t);
  const temCodigo = CODIGO.test(t);
  const temModelo = MODELO.test(t);
  const temPrompt = PROMPT.test(t);

  if (temRag && !temPrompt) {
    return {
      causa: 'rag',
      motivo: 'Isso parece mais um problema na base de informacoes do que no jeito de falar da IA.',
      recomendacao:
        'O melhor caminho e atualizar os documentos ou dados que a IA consulta. Se voce quiser, eu posso ajudar a melhorar como ela responde quando nao tiver certeza.',
      podeEditarComTreinador: false,
    };
  }

  if (temCodigo && !temPrompt) {
    return {
      causa: 'codigo',
      motivo: 'Isso parece regra do sistema, nao so um ajuste no texto da IA.',
      recomendacao:
        'Eu posso ajudar no jeito que a IA explica isso ao cliente, mas a regra em si precisa ser ajustada no sistema.',
      podeEditarComTreinador: false,
    };
  }

  if (temModelo && !temPrompt) {
    return {
      causa: 'config_modelo',
      motivo: 'Isso parece mais configuracao do motor da IA do que texto de atendimento.',
      recomendacao:
        'Esse tipo de ajuste costuma ser feito na configuracao do sistema. Se quiser, eu posso continuar ajudando no texto que a IA fala.',
      podeEditarComTreinador: false,
    };
  }

  if (temPrompt || (!temRag && !temCodigo && !temModelo)) {
    return {
      causa: 'prompt',
      motivo: temPrompt
        ? 'Seu pedido fala claramente sobre texto, tom ou mensagem da IA.'
        : 'Pelo que voce descreveu, isso parece um ajuste no jeito de responder da IA.',
      recomendacao: 'Vou localizar o trecho certo, te mostrar como ficaria e so depois aplicar se voce quiser.',
      podeEditarComTreinador: true,
    };
  }

  return {
    causa: 'ambiguo',
    motivo: 'Seu pedido mistura mudanca de texto com mudanca de informacao ou sistema.',
    recomendacao:
      'Me diga se voce quer mudar o jeito que a IA fala ou a informacao que ela consulta. A partir disso eu te guio melhor.',
    podeEditarComTreinador: false,
  };
}
