/**
 * Revisores LLM das camadas 2–5 do modo treinador.
 * Focos: persona, escopo de edição, tom WhatsApp, adversarial final.
 */
import { config } from '../../config.js';
import {
  parsearSaidaCamada,
  type SaidaCamada,
  CHECAGENS_PADRAO,
} from '../../agente-schema.js';

export type FocoTreinador =
  | 'persona_treinador'
  | 'escopo_edicao'
  | 'tom_whatsapp'
  | 'adversarial_final';

const FOCO_TEXTO: Record<FocoTreinador, string> = {
  persona_treinador:
    'FOCO: a mensagem DEVE ser de orquestrador/treinador, NUNCA de SAC/vendedora. ' +
    'Proibido menu de produtos/pedidos/conta/pagamentos. Em ola/como ajuda, listar so capacidades de treino.',
  escopo_edicao:
    'FOCO: se propõe mudança, deve ser sobre prompt/tom/fluxo/aprendizado. ' +
    'Nao invente capacidade de atender cliente final. Se so conversa/opiniao, APROVE se coherente.',
  tom_whatsapp:
    'FOCO: PT-BR curto, WhatsApp (*negrito*), sem jargao tecnico (patch/diff/tool), max ~1200 chars.',
  adversarial_final:
    'FOCO FINAL: ache se ainda parece chatbot generico ou atendimento. ' +
    'Se duvidar da persona, duvida=true e corrija para modo treinador.',
};

function modelo(foco: FocoTreinador): string {
  if (foco === 'adversarial_final') {
    return process.env.MODELO_CRITICO_OPENROUTER?.trim() || 'google/gemini-2.5-flash';
  }
  return process.env.MODELO_CHAT_OPENROUTER?.trim() || config.modeloChat || 'openai/gpt-4o-mini';
}

export function saidaDuvidaTreinador(c: SaidaCamada, motivo: string): SaidaCamada {
  return {
    ...c,
    justificativa: motivo,
    aprovar: false,
    duvida: true,
    interromper: true,
    confianca: 0.2,
    problemas: [...(c.problemas || []), motivo],
    checagens: { ...CHECAGENS_PADRAO, ...c.checagens },
  };
}

export async function chamarRevisorTreinador(opts: {
  camada: number;
  foco: FocoTreinador;
  historicoResumo: string;
  candidato: SaidaCamada;
}): Promise<SaidaCamada> {
  const system =
    'Voce revisa a resposta do MODO TREINADOR (camada ' +
    opts.camada +
    '/5). ' +
    FOCO_TEXTO[opts.foco] +
    ' Se nao tiver certeza, duvida=true. Responda SOMENTE JSON: ' +
    '{"mensagem":"...","justificativa":"...","checagens":{},"aprovar":bool,"duvida":bool,' +
    '"interromper":bool,"confianca":0.0,"problemas":[]}';

  try {
    const res = await fetch(`${config.openrouterBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.openrouterToken}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': config.openrouterReferer,
        'X-Title': `Treinador Revisor C${opts.camada}`,
      },
      body: JSON.stringify({
        model: modelo(opts.foco),
        temperature: 0,
        max_tokens: 1800,
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content:
              'Historico:\n' +
              opts.historicoResumo.slice(0, 1500) +
              '\n\nCandidato:\n' +
              JSON.stringify({
                mensagem: opts.candidato.mensagem,
                justificativa: opts.candidato.justificativa,
              }),
          },
        ],
      }),
    });
    if (!res.ok) {
      return saidaDuvidaTreinador(opts.candidato, `revisor_http_${res.status}`);
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const texto = String(json.choices?.[0]?.message?.content || '');
    const parsed = parsearSaidaCamada(texto);
    if (!parsed) return saidaDuvidaTreinador(opts.candidato, 'revisor_json_invalido');
    return {
      ...parsed,
      camada: opts.camada,
      foco: opts.foco,
    };
  } catch (err) {
    return saidaDuvidaTreinador(
      opts.candidato,
      `revisor_erro:${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
