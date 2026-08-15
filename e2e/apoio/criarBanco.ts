/**
 * Cria o banco descartável ANTES do servidor subir.
 *
 * POR QUE NÃO NO `globalSetup`: o Playwright sobe o `webServer` primeiro e só
 * depois roda o setup global. O servidor chegava num banco inexistente, o
 * autoMigrate falhava, e nenhuma tabela era criada — os testes então mediam um
 * sistema vazio e falhavam por um motivo que não era o deles.
 *
 * Aqui a ordem fica garantida: este script roda no mesmo comando que inicia o
 * servidor, antes dele.
 */

import { recriarBanco } from "./ambiente";

recriarBanco()
  .then(() => console.log("[e2e] banco descartável criado do zero"))
  .catch((erro) => {
    console.error("[e2e] falha ao criar o banco:", erro);
    process.exit(1);
  });
