/**
 * Stub OCR — frota SaaS edita so prompt_sistema pelo treinador.
 */
export async function obterPromptOcr(): Promise<string> { return ''; }
export async function obterPromptOcrForcado(): Promise<string> { return ''; }
export async function salvarPromptOcr(_t: string, _origem?: string): Promise<void> {
  throw new Error('Alvo ocr_prompt indisponivel — use prompt_sistema');
}
export async function salvarPromptOcrForcado(_t: string, _origem?: string): Promise<void> {
  throw new Error('Alvo ocr_prompt_forcado indisponivel — use prompt_sistema');
}
