/**
 * Depois de tudo: joga o banco fora.
 *
 * Roda mesmo quando os testes falham. Um banco de teste esquecido no servidor é
 * lixo que ninguém sabe de quem é — e num servidor compartilhado, confusão.
 */

import { descartarBanco } from "./ambiente";

export default async function encerrar() {
  await descartarBanco();
  console.log("[e2e] banco descartável removido");
}
