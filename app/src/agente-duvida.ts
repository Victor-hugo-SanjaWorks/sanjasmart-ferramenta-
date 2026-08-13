/**
 * Politica: se a IA duvidar, INTERROMPE (pausa + mensagem segura).
 * Vital: errar e inventar e pior do que passar para humano.
 * Usado por agente-camadas e agente-minasplaca.
 */
import {
  CONFIANCA_MINIMA,
  type SaidaCamada,
} from './agente-schema.js';

export const MSG_INTERRUPCAO =
  'Anotei o que pediu. Para tornar seu atendimento mais rápido, ' +
  'vou passar para um especialista da equipe. Em instantes alguém te responde por aqui. Obrigado pela paciência!';

export type DecisaoDuvida = {
  interromper: boolean;
  motivo: string;
  camada?: number;
};

/** Duvida explicita / interromper / confianca baixa → para na hora. */
export function decidirInterrupcao(
  camadas: SaidaCamada[],
  opts?: { exigirAprovacaoFinal?: boolean },
): DecisaoDuvida {
  for (const c of camadas) {
    if (c.interromper) {
      return {
        interromper: true,
        motivo: `camada_${c.camada ?? '?'}_interromper: ${(c.problemas || []).join('; ') || c.justificativa}`,
        camada: c.camada,
      };
    }
    if (c.duvida) {
      return {
        interromper: true,
        motivo: `camada_${c.camada ?? '?'}_duvida: ${(c.problemas || []).join('; ') || c.justificativa}`,
        camada: c.camada,
      };
    }
    if (typeof c.confianca === 'number' && c.confianca < CONFIANCA_MINIMA) {
      return {
        interromper: true,
        motivo: `camada_${c.camada ?? '?'}_confianca_${c.confianca}`,
        camada: c.camada,
      };
    }
  }
  if (opts?.exigirAprovacaoFinal) {
    const ultima = camadas[camadas.length - 1];
    if (ultima && ultima.aprovar === false) {
      return {
        interromper: true,
        motivo: `ultima_reprovou: ${(ultima.problemas || []).join('; ')}`,
        camada: ultima.camada,
      };
    }
  }
  return { interromper: false, motivo: '' };
}
