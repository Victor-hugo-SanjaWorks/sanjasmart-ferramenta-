/**
 * Shim: chat via OpenRouter da conta isolada do app.
 * Usado pelo agente e pelos servicos de patch/admin do treinador.
 */
import { config } from '../../config.js';
import { contaOpenrouterApp, headersOpenrouterChat } from '../../openrouter/conta-app.js';

export type ProvedorChat = 'openrouter' | 'openai' | 'groq' | 'claude';

export async function chatCompletionRaw(
  mensagens: Array<{ role: string; content: string }>,
  opts?: { temperature?: number; model?: string; max_tokens?: number },
): Promise<string> {
  const conta = contaOpenrouterApp();
  if (!conta.token) throw new Error('OpenRouter sem token');
  const body: Record<string, unknown> = {
    model: opts?.model || config.modeloChatOpenRouter || config.modeloChat,
    temperature: opts?.temperature ?? 0.3,
    messages: mensagens,
  };
  if (opts?.max_tokens) body.max_tokens = opts.max_tokens;
  const res = await fetch(`${config.openrouterBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: headersOpenrouterChat(conta),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(data.error?.message || `OpenRouter HTTP ${res.status}`);
  return (data.choices?.[0]?.message?.content || '').trim();
}
