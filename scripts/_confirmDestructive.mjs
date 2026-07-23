import readline from "node:readline/promises";

/**
 * Story 37 (SYS-08+DB-10): gate para scripts que escrevem/apagam dados
 * diretamente no banco apontado por DATABASE_URL. Evita rodar um desses
 * scripts contra o banco errado (produção) por engano.
 *
 * Uso: `await confirmDestructive("nome do script")` no topo do script,
 * antes de qualquer conexão/escrita. Passe CONFIRM=yes para pular o
 * prompt interativo (ex.: em CI ou automação já revisada).
 */
export async function confirmDestructive(scriptName) {
  const dbUrl = process.env.DATABASE_URL || "(não definida)";

  if (process.env.CONFIRM === "yes") {
    console.log(`[${scriptName}] CONFIRM=yes definido, prosseguindo sem prompt.`);
    return;
  }

  console.log(`\n⚠️  ${scriptName} vai escrever/apagar dados no banco:`);
  console.log(`    DATABASE_URL=${dbUrl}\n`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('Digite "CONFIRMAR" para continuar (qualquer outra coisa cancela): ');
  rl.close();

  if (answer.trim() !== "CONFIRMAR") {
    console.log("Cancelado.");
    process.exit(1);
  }
}
