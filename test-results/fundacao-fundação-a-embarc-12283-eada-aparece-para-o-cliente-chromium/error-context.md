# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fundacao.spec.ts >> fundação >> a embarcação semeada aparece para o cliente
- Location: e2e/fundacao.spec.ts:74:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('Lancha de Teste')
Expected: visible
Timeout: 20000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 20000ms
  - waiting for getByText('Lancha de Teste')

```

```yaml
- heading "This site can’t be reached" [level=1]
- paragraph:
  - text: The webpage at
  - strong: http://127.0.0.1:9/oauth/app-auth?appId=app-de-teste-e2e&redirectUri=http%3A%2F%2F127.0.0.1%3A4321%2Fapi%2Foauth%2Fcallback&state=aHR0cDovLzEyNy4wLjAuMTo0MzIxL2FwaS9vYXV0aC9jYWxsYmFjaw%3D%3D&type=signIn
  - text: might be temporarily down or it may have moved permanently to a new web address.
- text: ERR_UNSAFE_PORT
```

# Test source

```ts
  1  | /**
  2  |  * A fundação dos testes de ponta a ponta.
  3  |  *
  4  |  * Antes de testar fluxo nenhum, três coisas precisam estar provadas — e cada
  5  |  * uma delas foi, em algum momento desta auditoria, apontada como impedimento:
  6  |  *
  7  |  * 1. o sistema sobe do zero, sem ambiente hospedado;
  8  |  * 2. as tabelas são criadas sozinhas na subida;
  9  |  * 3. o robô consegue entrar, sem login externo.
  10 |  *
  11 |  * Se algum destes falhar, nenhum teste de fluxo acima tem valor — eles estariam
  12 |  * medindo outra coisa.
  13 |  */
  14 | 
  15 | import { test, expect } from "@playwright/test";
  16 | import { conectar } from "./apoio/ambiente";
  17 | import { entrarComo } from "./apoio/sessao";
  18 | import { semear, ADMIN, CLIENTE, EMBARCACAO } from "./apoio/semente";
  19 | 
  20 | test.describe("fundação", () => {
  21 |   test("o sistema sobe e responde", async ({ page }) => {
  22 |     const resposta = await page.goto("/");
  23 | 
  24 |     expect(resposta?.status()).toBe(200);
  25 |   });
  26 | 
  27 |   test("as tabelas foram criadas sozinhas na subida", async () => {
  28 |     // É o autoMigrate em ação. O mesmo mecanismo que estava quebrado em
  29 |     // produção e que hoje é a única coisa que leva schema ao banco.
  30 |     const pool = conectar();
  31 |     try {
  32 |       const [linhas]: any = await pool.query(
  33 |         "SELECT COUNT(*) AS total FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?",
  34 |         ["exclusive_e2e"],
  35 |       );
  36 | 
  37 |       expect(Number(linhas[0].total)).toBeGreaterThan(15);
  38 | 
  39 |       const [migracoes]: any = await pool.query(
  40 |         "SELECT COUNT(*) AS total FROM `__drizzle_migrations`",
  41 |       );
  42 |       expect(Number(migracoes[0].total)).toBeGreaterThan(0);
  43 |     } finally {
  44 |       await pool.end();
  45 |     }
  46 |   });
  47 | 
  48 |   test("a semente entra e o robô consegue entrar como administrador", async ({
  49 |     context,
  50 |     page,
  51 |     baseURL,
  52 |   }) => {
  53 |     const { embarcacaoId } = await semear();
  54 |     expect(embarcacaoId).toBeGreaterThan(0);
  55 | 
  56 |     await entrarComo(context, ADMIN, baseURL!);
  57 |     await page.goto("/admin/diagnostico");
  58 | 
  59 |     // A tela de diagnóstico é exclusiva de administrador. Se o robô a vê, a
  60 |     // sessão foi aceita e o papel foi reconhecido.
  61 |     await expect(page.getByText("Diagnóstico do Sistema")).toBeVisible();
  62 |     await expect(page.getByText("Marcador de build:")).toBeVisible();
  63 |   });
  64 | 
  65 |   test("sem sessão, a área de administrador NÃO abre", async ({ page }) => {
  66 |     // A contrapartida do teste acima. Sem isto, um bug de autorização passaria
  67 |     // despercebido: o teste anterior sozinho não distingue "a sessão funcionou"
  68 |     // de "qualquer um entra".
  69 |     await page.goto("/admin/diagnostico");
  70 | 
  71 |     await expect(page.getByText("Diagnóstico do Sistema")).toBeHidden({ timeout: 15_000 });
  72 |   });
  73 | 
  74 |   test("a embarcação semeada aparece para o cliente", async ({ context, page, baseURL }) => {
  75 |     await entrarComo(context, CLIENTE, baseURL!);
  76 |     await page.goto("/reservas");
  77 | 
> 78 |     await expect(page.getByText(EMBARCACAO.nome)).toBeVisible({ timeout: 20_000 });
     |                                                   ^ Error: expect(locator).toBeVisible() failed
  79 |   });
  80 | });
  81 | 
```