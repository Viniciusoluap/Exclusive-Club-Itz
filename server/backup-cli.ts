/**
 * Entrada por linha de comando para o backup: `pnpm backup`.
 *
 * POR QUE É UM ARQUIVO SEPARADO: esta chamada morava dentro de `backup.ts`,
 * protegida por `if (import.meta.url === file://${process.argv[1]})`. Esse
 * guard não sobrevive ao empacotamento: no `dist/index.js` gerado pelo esbuild,
 * `import.meta.url` é a URL do próprio pacote — a mesma coisa que
 * `process.argv[1]` quando se roda `node dist/index.js`. A condição era sempre
 * verdadeira em produção e um backup completo disparava a cada start do
 * servidor.
 *
 * Mantendo a execução num arquivo que só é usado como script, importar
 * `backup.ts` deixa de ter efeito colateral — não existe mais condição a
 * avaliar, então não existe mais como ela dar errado.
 */

import { runBackup } from "./backup";

runBackup()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
