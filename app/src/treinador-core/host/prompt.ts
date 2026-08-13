/**
 * Shim: prompt do host para o treinador-core (aceita origem opcional).
 * Persistencia real fica em prompt-minasplaca do app.
 */
import {
  obterPromptBruto as obterBruto,
  salvarPrompt as salvarHost,
} from '../../prompt-minasplaca.js';

export async function obterPromptBruto(): Promise<string> {
  return obterBruto();
}

export async function salvarPrompt(
  prompt: string,
  _origem?: string,
): Promise<{ qdrantOk?: boolean }> {
  await salvarHost(prompt);
  return { qdrantOk: false };
}
