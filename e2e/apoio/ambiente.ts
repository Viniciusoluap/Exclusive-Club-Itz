/**
 * Ambiente descartável para os testes de ponta a ponta (Story 24).
 *
 * POR QUE ISTO EXISTE: um robô que testa os fluxos do sistema precisa de um
 * lugar para praticar. Rodar contra o sistema de verdade criaria reservas de
 * verdade, cobranças de verdade e PIX de verdade na conta Asaas do clube — o
 * que é inaceitável.
 *
 * A SAÍDA: montar um sistema inteiro do zero a cada execução. O servidor já
 * aplica as migrações sozinho na subida (autoMigrate), então basta criar um
 * banco vazio e apontar para ele. Ao final, o banco é descartado.
 *
 * Nenhum dado real é tocado, nenhuma credencial de produção é usada, e nada
 * sobrevive à execução.
 */

import { createPool } from "mysql2/promise";

/** Nome do banco descartável. Fixo, para o servidor poder ser configurado antes. */
export const BANCO_E2E = "exclusive_e2e";

/**
 * Segredos de mentira, só para os testes.
 *
 * Não são credenciais: são valores arbitrários que o teste escolhe e o servidor
 * aceita. É justamente por o teste controlar a chave de sessão que ele consegue
 * "entrar" no sistema sem depender de login externo.
 */
export const SEGREDOS_E2E = {
  JWT_SECRET: "segredo-de-teste-e2e-nao-usar-em-lugar-nenhum",
  VITE_APP_ID: "app-de-teste-e2e",
};

/** URL do banco descartável, derivada da URL base do ambiente. */
export function urlDoBancoE2E(): string {
  return trocarBanco(urlBase(), BANCO_E2E);
}

function urlBase(): string {
  const base = process.env.DATABASE_URL;
  if (!base) {
    throw new Error(
      "DATABASE_URL não configurada. Os testes de ponta a ponta precisam de um " +
        "servidor MySQL/TiDB disponível para criar o banco descartável.",
    );
  }
  return base;
}

function trocarBanco(url: string, nome: string): string {
  return url.replace(/\/[^/?]+(\?|$)/, `/${nome}$1`);
}

/**
 * URL para criar e apagar bancos.
 *
 * Aponta para `mysql`, o banco de sistema que sempre existe. Usar a
 * `DATABASE_URL` como veio não funciona: quando este código roda junto do
 * servidor, ela já aponta para o banco descartável — que é justamente o que
 * ainda não existe. Foi assim que a primeira tentativa falhou com
 * "Unknown database 'exclusive_e2e'".
 */
function urlAdministrativa(): string {
  return trocarBanco(urlBase(), "mysql");
}

/** Apaga e recria o banco do zero. Chamado antes de tudo. */
export async function recriarBanco(): Promise<void> {
  const admin = createPool(urlAdministrativa());
  try {
    await admin.query(`DROP DATABASE IF EXISTS \`${BANCO_E2E}\``);
    await admin.query(`CREATE DATABASE \`${BANCO_E2E}\``);
  } finally {
    await admin.end();
  }
}

/** Descarta o banco. Chamado ao final, mesmo se os testes falharem. */
export async function descartarBanco(): Promise<void> {
  const admin = createPool(urlAdministrativa());
  try {
    await admin.query(`DROP DATABASE IF EXISTS \`${BANCO_E2E}\``);
  } finally {
    await admin.end();
  }
}

/** Conexão com o banco descartável, para semear e conferir dados. */
export function conectar() {
  return createPool(urlDoBancoE2E());
}
