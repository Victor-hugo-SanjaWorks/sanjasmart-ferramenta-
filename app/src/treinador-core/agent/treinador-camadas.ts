/**
 * Pipeline 5 camadas do modo treinador: rascunho + 4 revisões JSON.
 * Depois válvula anti-SAC; persiste auditoria (origem=treinador).
 */
import { randomUUID } from 'crypto';
import type { SaidaCamada } from '../../agente-schema.js';
import { CHECAGENS_PADRAO } from '../../agente-schema.js';
import { decidirInterrupcao } from '../../agente-duvida.js';
import { MSG_TREINADOR_CAPACIDADES } from './treinador-system-prompt.js';
import { aplicarValvulaTreinador } from './treinador-valvula-sac.js';
import {
  chamarRevisorTreinador,
  type FocoTreinador,
} from './treinador-revisor-camada.js';
import { salvarAuditoriaMensagem } from '../../ia-auditoria-store.js';

const FOCOS: FocoTreinador[] = [
  'persona_treinador',
  'escopo_edicao',
  'tom_whatsapp',
  'adversarial_final',
];

export type ResultadoCamadasTreinador = {
  mensagem: string;
  camadas: SaidaCamada[];
  problemas: string[];
  interromper: boolean;
  mensagem_id: string;
};

export async function revisarRespostaTreinador(opts: {
  telefone: string;
  textoCamada1: string;
  historicoResumo: string;
  contatoId?: string;
}): Promise<ResultadoCamadasTreinador> {
  const mensagemId = randomUUID();
  const camadas: SaidaCamada[] = [];

  let atual: SaidaCamada = {
    mensagem: opts.textoCamada1,
    justificativa: 'Geracao do agente treinador (camada 1).',
    checagens: { ...CHECAGENS_PADRAO },
    aprovar: true,
    duvida: false,
    interromper: false,
    confianca: 0.85,
    problemas: [],
    camada: 1,
    foco: 'geracao',
  };
  camadas.push(atual);

  // Valvula cedo: se ja veio SAC, corrige antes dos revisores
  const v0 = aplicarValvulaTreinador(atual.mensagem);
  if (v0.corrigiu) {
    atual = {
      ...atual,
      mensagem: v0.mensagem,
      justificativa: 'Valvula anti-SAC (pre-revisores).',
      problemas: [...atual.problemas, ...v0.problemas],
      confianca: 0.9,
    };
    camadas[0] = atual;
  }

  for (let i = 0; i < FOCOS.length; i++) {
    const camada = i + 2;
    const rev = await chamarRevisorTreinador({
      camada,
      foco: FOCOS[i],
      historicoResumo: opts.historicoResumo,
      candidato: atual,
    });
    camadas.push(rev);
    atual = rev;

    const dec = decidirInterrupcao([rev]);
    if (dec.interromper) {
      atual = {
        ...atual,
        mensagem: MSG_TREINADOR_CAPACIDADES,
        justificativa: `Interrompido: ${dec.motivo}`,
        interromper: true,
        duvida: true,
      };
      camadas.push({ ...atual, camada: 99, foco: 'interrupcao' });
      break;
    }
  }

  const valv = aplicarValvulaTreinador(atual.mensagem);
  if (valv.corrigiu) {
    atual = {
      ...atual,
      mensagem: valv.mensagem,
      justificativa: (atual.justificativa || '') + ' | valvula_final_anti_sac',
      problemas: [...(atual.problemas || []), ...valv.problemas],
    };
    camadas.push({
      ...atual,
      camada: 98,
      foco: 'valvula_sac',
      justificativa: 'Valvula final anti-SAC.',
    });
  }

  const problemas = camadas.flatMap((c) => c.problemas || []);
  try {
    await salvarAuditoriaMensagem({
      telefone: opts.telefone,
      mensagemFinal: atual.mensagem,
      camadas,
      problemas,
      origem: 'treinador',
      contatoId: opts.contatoId || opts.telefone,
      mensagemId,
    });
  } catch (err) {
    console.error('[treinador-camadas] auditoria:', err);
  }

  return {
    mensagem: atual.mensagem,
    camadas,
    problemas,
    interromper: !!atual.interromper,
    mensagem_id: mensagemId,
  };
}
