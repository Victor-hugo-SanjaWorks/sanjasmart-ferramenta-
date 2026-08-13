/**
 * LLM do treinador WhatsApp: conversa + proposta de patch no prompt.
 * Resposta em JSON para o host confirmar antes de mutar.
 */
import { config } from './config.js';
import { contaOpenrouterApp, headersOpenrouterChat } from './openrouter/conta-app.js';
import { obterPromptBruto } from './prompt-minasplaca.js';

export type PropostaPatch = {
  operacao: 'replace_trecho' | 'append_bloco' | 'prepend_bloco';
  trechoAlvo: string | null;
  textoProposto: string;
  resumo: string;
};

export type RespostaLlmTreinador = {
  tipo: 'conversa' | 'proposta';
  mensagem: string;
  proposta: PropostaPatch | null;
};

const SYSTEM = `Você é o copiloto de treino da IA de atendimento (WhatsApp).
Missão: ajudar a melhorar o PROMPT_SISTEMA da IA — tom, regras, FAQ, objeções.
Regras:
- Fale PT-BR curto, tom WhatsApp (*negrito* com um asterisco).
- NUNCA invente que já aplicou mudança. Só proponha.
- Se o pedido for vago, pergunte 1 detalhe OU ofereça 2 caminhos.
- Se for propor edição, responda APENAS com JSON válido (sem markdown):
{"tipo":"proposta","mensagem":"texto amigável pedindo confirmação","proposta":{"operacao":"replace_trecho|append_bloco|prepend_bloco","trechoAlvo":"texto exato a trocar ou null","textoProposto":"texto novo","resumo":"resumo curto"}}
- Se for só conversa/opinião:
{"tipo":"conversa","mensagem":"sua resposta","proposta":null}
- replace_trecho exige trechoAlvo que exista no prompt atual.
- append_bloco/prepend_bloco: trechoAlvo null, textoProposto = bloco a acrescentar.`;

export async function perguntarLlmTreinador(opts: {
  mensagem: string;
  historicoCurto?: Array<{ role: 'user' | 'assistant'; content: string }>;
}): Promise<RespostaLlmTreinador> {
  const token = contaOpenrouterApp().token;
  if (!token) throw new Error('OpenRouter sem token neste app');

  const prompt = await obterPromptBruto();
  const trecho = prompt.length > 12000 ? `${prompt.slice(0, 6000)}\n…\n${prompt.slice(-6000)}` : prompt;

  const msgs: Array<{ role: string; content: string }> = [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `PROMPT ATUAL (pode estar truncado):\n---\n${trecho}\n---`,
    },
  ];
  for (const h of opts.historicoCurto || []) {
    msgs.push({ role: h.role, content: h.content });
  }
  msgs.push({ role: 'user', content: opts.mensagem });

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: headersOpenrouterChat(),
    body: JSON.stringify({
      model: config.modeloChat,
      temperature: 0.3,
      messages: msgs,
    }),
    signal: AbortSignal.timeout(90_000),
  });
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(data.error?.message || `OpenRouter HTTP ${res.status}`);
  }
  const raw = (data.choices?.[0]?.message?.content || '').trim();
  return parseResposta(raw);
}

function parseResposta(raw: string): RespostaLlmTreinador {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const j = JSON.parse(jsonMatch[0]) as RespostaLlmTreinador;
      if (j.tipo === 'proposta' && j.proposta?.textoProposto) {
        return {
          tipo: 'proposta',
          mensagem: j.mensagem || 'Posso aplicar essa mudança? Responda *sim* para confirmar.',
          proposta: {
            operacao: j.proposta.operacao || 'append_bloco',
            trechoAlvo: j.proposta.trechoAlvo || null,
            textoProposto: j.proposta.textoProposto,
            resumo: j.proposta.resumo || 'Ajuste no prompt',
          },
        };
      }
      if (j.mensagem) {
        return { tipo: 'conversa', mensagem: j.mensagem, proposta: null };
      }
    } catch { /* fallback texto */ }
  }
  return { tipo: 'conversa', mensagem: raw || 'Não entendi — pode reformular?', proposta: null };
}
