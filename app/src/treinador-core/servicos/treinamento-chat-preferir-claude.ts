/**
 * Preferencia Claude para gerar a estrutura do patch (F4.12 / C#44).
 * Motivo: Claude costuma editar prompts com mais precisao cirurgica.
 * Tenta Anthropic; se falhar ou sem token, cai no chatCompletionRaw do host.
 */
import { config } from '../../config.js';
import { chatCompletionRaw } from '../host/chat-providers.js';

type Msg = { role: string; content: string };

async function chatClaudeRaw(
  mensagens: Msg[],
  opts?: { temperature?: number; max_tokens?: number },
): Promise<string> {
  const token = (config as { anthropicToken?: string }).anthropicToken;
  if (!token) throw new Error('anthropic_ausente');
  const modelo =
    (config as { modeloChatClaude?: string }).modeloChatClaude || 'claude-sonnet-4-5';

  const system = mensagens.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const msgs = mensagens
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }));

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': token,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: modelo,
      max_tokens: opts?.max_tokens || 4096,
      temperature: opts?.temperature ?? 0.15,
      system: system || undefined,
      messages: msgs.length ? msgs : [{ role: 'user', content: '(vazio)' }],
    }),
    signal: AbortSignal.timeout(90_000),
  });
  const data = (await res.json()) as {
    content?: Array<{ type?: string; text?: string }>;
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(data.error?.message || `Claude HTTP ${res.status}`);
  return (data.content || [])
    .filter((c) => c.type === 'text')
    .map((c) => c.text || '')
    .join('\n')
    .trim();
}

/** Gera texto de patch: Claude primeiro, senao provedor padrao do host. */
export async function chatParaGerarPatch(
  mensagens: Msg[],
  opts?: { temperature?: number; max_tokens?: number },
): Promise<{ texto: string; provedor: 'claude' | 'host' }> {
  try {
    const texto = await chatClaudeRaw(mensagens, opts);
    if (texto) return { texto, provedor: 'claude' };
  } catch (err) {
    console.warn(
      '[treinador] Claude indisponivel p/ patch, fallback host:',
      err instanceof Error ? err.message : err,
    );
  }
  const texto = await chatCompletionRaw(mensagens, opts);
  return { texto, provedor: 'host' };
}
