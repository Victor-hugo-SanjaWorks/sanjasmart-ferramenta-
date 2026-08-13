/**
 * Captura caso ruim do atendimento e gera proposta de patch (F3.2).
 * Se faltar mensagem/resposta, tenta completar pelo historico do telefone.
 */
import { obterHistorico } from '../host/historico.js';
import { criarPropostaPatchConfiguracao } from './treinamento-config-patches.js';
import { chaveDashboard } from './treinamento-chave-dashboard.js';
import {
  casoRuimTemConteudoMinimo,
  montarInstrucaoCasoRuim,
  type CasoRuimEntrada,
} from './treinamento-caso-ruim-texto.js';
import { adicionarExemploTreino } from './treinamento-exemplos-store.js';

async function completarDoHistorico(c: CasoRuimEntrada): Promise<CasoRuimEntrada> {
  const tel = String(c.telefoneCliente || '').trim();
  if (!tel) return c;
  if (c.mensagemCliente && c.respostaIa) return c;
  try {
    const hist = await obterHistorico(tel, { limite: 30 });
    const msgs = Array.isArray(hist) ? hist : [];
    let respostaIa = c.respostaIa;
    let mensagemCliente = c.mensagemCliente;
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i] as { role?: string; content?: string };
      if (!respostaIa && m.role === 'assistant' && String(m.content || '').trim()) {
        respostaIa = String(m.content);
        for (let j = i - 1; j >= 0; j--) {
          const u = msgs[j] as { role?: string; content?: string };
          if (u.role === 'user' && String(u.content || '').trim()) {
            mensagemCliente = mensagemCliente || String(u.content);
            break;
          }
        }
        break;
      }
    }
    return { ...c, mensagemCliente, respostaIa };
  } catch {
    return c;
  }
}

export async function capturarCasoRuimParaTreino(opts: {
  caso: CasoRuimEntrada;
  autor?: string;
}) {
  const caso = await completarDoHistorico(opts.caso || {});
  if (!casoRuimTemConteudoMinimo(caso)) {
    throw new Error(
      'Informe a resposta da IA, o que deveria ter dito, ou uma observacao (min. 10 chars).',
    );
  }
  const texto = montarInstrucaoCasoRuim(caso);
  const chave = chaveDashboard(opts.autor || 'painel');
  const patch = await criarPropostaPatchConfiguracao({
    texto,
    telefoneAutor: chave,
    nomeAutor: opts.autor || 'painel',
    canal: 'dashboard',
    modoBusca: 'hibrida',
    queryBusca: [
      caso.mensagemCliente,
      caso.respostaIa,
      caso.respostaEsperada,
      caso.observacao,
    ]
      .filter(Boolean)
      .join(' ')
      .slice(0, 500),
    limiteBusca: 8,
  });

  // F3.3: alimenta biblioteca few-shot quando ha par ruim/bom
  if (caso.respostaIa && caso.respostaEsperada) {
    await adicionarExemploTreino({
      ruim: caso.respostaIa,
      bom: caso.respostaEsperada,
      contexto: caso.mensagemCliente || caso.observacao,
      tags: ['caso-ruim'],
    }).catch(() => undefined);
  }

  return {
    instrucao: texto,
    patch,
    casoUsado: caso,
  };
}
