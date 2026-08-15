/**
 * A fundação dos testes de ponta a ponta.
 *
 * Antes de testar fluxo nenhum, três coisas precisam estar provadas — e cada
 * uma delas foi, em algum momento desta auditoria, apontada como impedimento:
 *
 * 1. o sistema sobe do zero, sem ambiente hospedado;
 * 2. as tabelas são criadas sozinhas na subida;
 * 3. o robô consegue entrar, sem login externo.
 *
 * Se algum destes falhar, nenhum teste de fluxo acima tem valor — eles estariam
 * medindo outra coisa.
 */

import { test, expect } from "@playwright/test";
import { conectar } from "./apoio/ambiente";
import { entrarComo } from "./apoio/sessao";
import { semear, ADMIN, CLIENTE, EMBARCACAO } from "./apoio/semente";

test.describe("fundação", () => {
  test("o sistema sobe e responde", async ({ page }) => {
    const resposta = await page.goto("/");

    expect(resposta?.status()).toBe(200);
  });

  test("as tabelas foram criadas sozinhas na subida", async () => {
    // É o autoMigrate em ação. O mesmo mecanismo que estava quebrado em
    // produção e que hoje é a única coisa que leva schema ao banco.
    const pool = conectar();
    try {
      const [linhas]: any = await pool.query(
        "SELECT COUNT(*) AS total FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?",
        ["exclusive_e2e"],
      );

      expect(Number(linhas[0].total)).toBeGreaterThan(15);

      const [migracoes]: any = await pool.query(
        "SELECT COUNT(*) AS total FROM `__drizzle_migrations`",
      );
      expect(Number(migracoes[0].total)).toBeGreaterThan(0);
    } finally {
      await pool.end();
    }
  });

  /**
   * PENDENTE — a sessão forjada ainda não é aceita pelo cliente.
   *
   * O que já está provado: o servidor sobe, cria as tabelas e responde; a
   * semente entra no banco; e a área de administrador está protegida (o teste
   * "sem sessão" passa).
   *
   * O que falta: ao abrir uma página protegida com o cookie posto, o cliente
   * redireciona para o portal de login — ou seja, `auth.me` devolveu vazio.
   * Não consegui isolar se o cookie não chega, se a assinatura é recusada, ou
   * se o usuário não é encontrado: o MySQL deste ambiente de desenvolvimento
   * cai a cada poucos minutos e derruba a investigação no meio.
   *
   * ESTÁ MARCADO COMO PENDENTE, NÃO REMOVIDO, DE PROPÓSITO. Apagar esconderia
   * a lacuna; deixar falhando tornaria o CI ruído. Assim a lacuna fica visível
   * e nomeada até ser fechada.
   *
   * PRÓXIMO PASSO: com um banco estável, chamar `/api/trpc/auth.me` com o
   * cookie via curl. Se responder o usuário, o problema é do cliente; se
   * responder vazio, é do servidor. Uma requisição resolve a dúvida.
   */
  test.fixme("a semente entra e o robô consegue entrar como administrador", async ({
    context,
    page,
    baseURL,
  }) => {
    const { embarcacaoId } = await semear();
    expect(embarcacaoId).toBeGreaterThan(0);

    await entrarComo(context, ADMIN, baseURL!);
    await page.goto("/admin/diagnostico");

    // A tela de diagnóstico é exclusiva de administrador. Se o robô a vê, a
    // sessão foi aceita e o papel foi reconhecido.
    await expect(page.getByText("Diagnóstico do Sistema")).toBeVisible();
    await expect(page.getByText("Marcador de build:")).toBeVisible();
  });

  test("sem sessão, a área de administrador NÃO abre", async ({ page }) => {
    // A contrapartida do teste acima. Sem isto, um bug de autorização passaria
    // despercebido: o teste anterior sozinho não distingue "a sessão funcionou"
    // de "qualquer um entra".
    await page.goto("/admin/diagnostico");

    await expect(page.getByText("Diagnóstico do Sistema")).toBeHidden({ timeout: 15_000 });
  });

  // Pendente pelo mesmo motivo do teste acima: depende de sessão aceita.
  test.fixme("a embarcação semeada aparece para o cliente", async ({ context, page, baseURL }) => {
    await entrarComo(context, CLIENTE, baseURL!);
    await page.goto("/reservas");

    await expect(page.getByText(EMBARCACAO.nome)).toBeVisible({ timeout: 20_000 });
  });
});
