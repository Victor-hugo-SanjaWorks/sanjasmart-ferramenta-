/**
 * Válvula determinística anti-persona SAC no modo treinador.
 * Se a resposta parecer atendimento ao cliente final, corrige para template de treino.
 */
import { MSG_TREINADOR_CAPACIDADES } from './treinador-system-prompt.js';

const RE_SAC =
  /informa[cç][oõ]es sobre produtos|acompanhamento de pedidos|problemas com (sua )?conta|d[uú]vidas sobre pagamentos|sugest[oõ]es de produtos|estou aqui para ajudar|o que voc[eê] gostaria de saber ou fazer|resolu[cç][aã]o de problemas com sua conta/i;

const RE_METALINGUA_OLA =
  /parece que voc[eê] est[aá] apenas dizendo|voc[eê] est[aá] s[oó] dizendo ["']?ol[aá]/i;

export type ResultadoValvulaTreinador = {
  mensagem: string;
  corrigiu: boolean;
  problemas: string[];
};

export function aplicarValvulaTreinador(mensagem: string): ResultadoValvulaTreinador {
  const msg = String(mensagem || '').trim();
  const problemas: string[] = [];
  if (RE_SAC.test(msg)) problemas.push('persona_sac_generica');
  if (RE_METALINGUA_OLA.test(msg)) problemas.push('metalinguagem_ola');
  if (!problemas.length) {
    return { mensagem: msg, corrigiu: false, problemas: [] };
  }
  return {
    mensagem: MSG_TREINADOR_CAPACIDADES,
    corrigiu: true,
    problemas,
  };
}
