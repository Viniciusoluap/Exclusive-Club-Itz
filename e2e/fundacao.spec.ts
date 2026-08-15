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
   * A sessão forjada não era aceita: `authenticateRequest()` grava
   * `lastSignedIn` com `new Date().toISOString()` cru a cada login, e essa
   * string ("2026-08-15T18:19:22.159Z") é rejeitada por um MySQL em modo
   * estrito (ER_TRUNCATED_WRONG_VALUE). `createContext()` engole qualquer
   * erro de `authenticateRequest()` como "sessão inválida", então a falha de
   * SQL virava, silenciosamente, "usuário não logado". Corrigido em
   * `toMysqlDatetime()` (server/_core/dateBR.ts), aplicado nos 5 pontos que
   * gravavam datetime cru: sdk.ts, db.ts (x2), oauth.ts, systemSettings.ts.
   */
  test("a semente entra e o robô consegue entrar como administrador", async ({
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

  test("a embarcação semeada aparece para o cliente", async ({ context, page, baseURL }) => {
    await entrarComo(context, CLIENTE, baseURL!);
    await page.goto("/reservas");

    // A tela repete o nome da embarcação em mais de um bloco (uso de quotas e
    // calendário) — `.first()` basta para provar que ela aparece, sem
    // depender de quantas vezes.
    await expect(page.getByText(EMBARCACAO.nome).first()).toBeVisible({ timeout: 20_000 });
  });
});
