/**
 * Compara comportamento da IA com prompt antes vs depois (teste rapido).
 * Roda poucas mensagens sinteticas via LLM — prova se a mudanca fez efeito.
 * Usado apos propor/aplicar patch (tool verificar_comportamento).
 */
import { chatCompletionRaw } from '../host/chat-providers.js';

export type CasoTesteComportamento = {
  mensagemUsuario: string;
  esperadoContem?: string;
};

export type ResultadoCaso = {
  mensagemUsuario: string;
  respostaAntes: string;
  respostaDepois: string;
  melhorou: boolean | null;
  nota: string;
};

export type RelatorioVerificacao = {
  casos: ResultadoCaso[];
  resumo: string;
  mudouAlgo: boolean;
};

async function simularResposta(promptSistema: string, mensagem: string): Promise<string> {
  const texto = await chatCompletionRaw(
    [
      {
        role: 'system',
        content:
          String(promptSistema || '').slice(0, 6000) ||
          'Voce e um assistente de atendimento. Responda em 1-3 frases curtas.',
      },
      { role: 'user', content: mensagem },
    ],
    { temperature: 0.2, max_tokens: 180 },
  );
  return String(texto || '').trim().slice(0, 500);
}

function casosPadrao(pedido: string): CasoTesteComportamento[] {
  const p = String(pedido || '').toLowerCase();
  if (/saudac|bom\s*dia|ola|oi\b/.test(p)) {
    return [
      { mensagemUsuario: 'Oi' },
      { mensagemUsuario: 'Bom dia, preciso de ajuda' },
    ];
  }
  return [
    { mensagemUsuario: 'Ola, tudo bem?' },
    { mensagemUsuario: 'Pode me explicar como funciona?' },
  ];
}

/**
 * Roda ate 2 casos: mesma mensagem com prompt antes e depois.
 * melhorou=null se nao ha criterio lexical; ainda assim reporta se as respostas diferem.
 */
export async function verificarComportamentoPatch(opts: {
  promptAntes: string;
  promptDepois: string;
  pedido?: string;
  casos?: CasoTesteComportamento[];
}): Promise<RelatorioVerificacao> {
  const casos = (opts.casos && opts.casos.length
    ? opts.casos
    : casosPadrao(opts.pedido || '')
  ).slice(0, 2);

  const resultados: ResultadoCaso[] = [];
  for (const c of casos) {
    const [antes, depois] = await Promise.all([
      simularResposta(opts.promptAntes, c.mensagemUsuario),
      simularResposta(opts.promptDepois, c.mensagemUsuario),
    ]);
    const mudou = antes !== depois;
    let melhorou: boolean | null = mudou ? null : false;
    let nota = mudou ? 'Respostas diferentes (revisar se melhorou).' : 'Sem mudanca perceptivel.';
    if (c.esperadoContem) {
      const okAntes = antes.toLowerCase().includes(c.esperadoContem.toLowerCase());
      const okDepois = depois.toLowerCase().includes(c.esperadoContem.toLowerCase());
      melhorou = !okAntes && okDepois ? true : okAntes && !okDepois ? false : mudou ? null : false;
      nota = okDepois
        ? `Depois contem "${c.esperadoContem}".`
        : `Depois NAO contem "${c.esperadoContem}".`;
    }
    resultados.push({
      mensagemUsuario: c.mensagemUsuario,
      respostaAntes: antes,
      respostaDepois: depois,
      melhorou,
      nota,
    });
  }

  const mudouAlgo = resultados.some((r) => r.respostaAntes !== r.respostaDepois);
  const ganhos = resultados.filter((r) => r.melhorou === true).length;
  const resumo = mudouAlgo
    ? `Verificacao: ${resultados.length} casos, ${ganhos} com ganho claro, respostas ${mudouAlgo ? 'mudaram' : 'iguais'}.`
    : 'Verificacao: respostas iguais antes/depois — patch pode nao ter efeito pratico.';

  return { casos: resultados, resumo, mudouAlgo };
}
