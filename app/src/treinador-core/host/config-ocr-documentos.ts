/**
 * Stub OCR documentos — tipagem compativel com o agente, vazio na frota.
 */
export type OcrDocumentoConfig = {
  id: string;
  rotulo: string;
  tipoDocumento: string;
  colecao: string;
  dicaPrompt: string;
  ativo: boolean;
  campos: unknown[];
};
export async function listarOcrDocumentos(): Promise<OcrDocumentoConfig[]> { return []; }
export async function salvarOcrDocumentos(
  _d: OcrDocumentoConfig[],
  _origem?: string,
): Promise<void> {
  throw new Error('Alvo ocr_documentos_schema indisponivel — use prompt_sistema');
}
