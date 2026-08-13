/**
 * Script CLI do inventario frota F5.8.
 * Rode: npx tsx backend/src/servicos/treinamento-inventario-frota.ts
 */
import { gerarInventarioFrota } from './treinamento-inventario.js';

async function main(): Promise<void> {
  const itens = await gerarInventarioFrota();
  console.log(JSON.stringify({ total: itens.length, itens }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
