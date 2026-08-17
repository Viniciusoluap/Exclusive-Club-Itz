/**
 * Os fluxos que o clube não pode perder (Story 24 / SYS-07).
 *
 * A fundação (`fundacao.spec.ts`) prova que o sistema sobe e que dá para
 * entrar. Estes testes provam o que o cliente de fato faz: reservar uma
 * embarcação, registrar uma vistoria com foto e lançar um abastecimento.
 *
 * POR QUE PELA TELA E NÃO PELA API: um teste de API passaria mesmo com a tela
 * quebrada — e é a tela que o sócio usa. Estes percorrem o caminho inteiro
 * (navegador → tRPC → banco) e conferem o resultado no banco, não só o aviso
 * verde. Aviso verde já mentiu nesta auditoria: o backup dizia "Sucesso" e não
 * restaurava.
 *
 * Nada aqui toca produção nem a conta Asaas: o banco é criado e descartado a
 * cada execução, e os segredos são de mentira.
 */

import { test, expect } from "@playwright/test";
import { conectar } from "./apoio/ambiente";
import { entrarComo } from "./apoio/sessao";
import { semear, semearReservaUtilizada, ADMIN, CLIENTE, EMBARCACAO } from "./apoio/semente";

/** Um PNG de 1x1 de verdade — o servidor recusa qualquer coisa que não seja imagem. */
const PNG_MINIMO = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/**
 * Um dia livre garantido: no mês que vem (nunca no passado) e nunca segunda
 * (o clube não abre segunda — a própria tela marca como "Não Abrimos").
 */
function diaReservavelDoProximoMes(): { dia: number; data: Date } {
  const hoje = new Date();
  const primeiro = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
  for (let dia = 1; dia <= 28; dia++) {
    const data = new Date(primeiro.getFullYear(), primeiro.getMonth(), dia);
    if (data.getDay() !== 1) return { dia, data };
  }
  throw new Error("mês sem dia útil — impossível");
}

test.describe("fluxos críticos", () => {
  test("o cliente reserva uma embarcação e a reserva chega ao banco", async ({
    context,
    page,
    baseURL,
  }) => {
    await semear();
    await entrarComo(context, CLIENTE, baseURL!);

    await page.goto("/reservas");
    await expect(page.getByText(EMBARCACAO.nome).first()).toBeVisible({ timeout: 20_000 });

    // O calendário abre no mês corrente, onde os dias já passados aparecem
    // bloqueados. Ir para o mês seguinte garante um dia livre sem depender de
    // que dia é hoje — se não, o teste passaria dia 1 e falharia dia 30.
    await page.getByRole("button", { name: "Próximo mês" }).click();

    const { dia } = diaReservavelDoProximoMes();
    const calendario = page.locator("div.grid.grid-cols-7").last();
    await calendario.getByText(String(dia), { exact: true }).click();

    await expect(page.getByText("Nova Reserva")).toBeVisible();
    await page.getByRole("button", { name: "Confirmar Reserva" }).click();

    await expect(page.getByText("Reserva criada com sucesso!")).toBeVisible({ timeout: 15_000 });

    // A confirmação na tela não basta: o que importa é a linha no banco.
    const pool = conectar();
    try {
      const [linhas]: any = await pool.query(
        "SELECT `client_email`, `vessel_name`, `status` FROM `bookings` WHERE `client_email` = ? AND `status` = 'confirmed'",
        [CLIENTE.email],
      );
      expect(linhas.length).toBe(1);
      expect(linhas[0].vessel_name).toBe(EMBARCACAO.nome);
      expect(linhas[0].status).toBe("confirmed");
    } finally {
      await pool.end();
    }
  });

  test("segunda-feira não é reservável — o clube não abre", async ({
    context,
    page,
    baseURL,
  }) => {
    // A contrapartida do teste acima. Sem ela, um bug que liberasse qualquer
    // data passaria despercebido: o primeiro teste sozinho não distingue
    // "reservou o dia certo" de "reserva qualquer dia".
    await semear();
    await entrarComo(context, CLIENTE, baseURL!);

    await page.goto("/reservas");
    await expect(page.getByText(EMBARCACAO.nome).first()).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Próximo mês" }).click();

    const hoje = new Date();
    const primeiro = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
    let segunda = 1;
    while (new Date(primeiro.getFullYear(), primeiro.getMonth(), segunda).getDay() !== 1) {
      segunda++;
    }

    const calendario = page.locator("div.grid.grid-cols-7").last();
    await calendario.getByText(String(segunda), { exact: true }).click();

    // Clicar numa segunda não abre diálogo nenhum.
    await expect(page.getByText("Nova Reserva")).toBeHidden();
  });

  test("o administrador registra uma vistoria e ela chega ao banco", async ({
    context,
    page,
    baseURL,
  }) => {
    await semearReservaUtilizada();
    await entrarComo(context, ADMIN, baseURL!);

    await page.goto("/admin/vistorias");
    await page.getByRole("button", { name: "Nova Vistoria" }).click();

    await escolherNoSelect(page, "Selecione uma reserva", EMBARCACAO.nome);
    await page.locator("#inspectionDate").fill(hojeIso());
    await escolherNoSelect(page, "Selecione o tipo", "Lancha");

    // Aprovar tudo sem depender da lista de itens: ela muda conforme o tipo de
    // embarcação e mudaria este teste junto. Os rádios de aprovação têm id
    // terminado em "-aprovado", então clicar em todos vale para qualquer lista.
    const aprovados = page.locator('[id$="-aprovado"]');
    const total = await aprovados.count();
    expect(total).toBeGreaterThan(5);
    for (let i = 0; i < total; i++) {
      await aprovados.nth(i).click();
    }

    const antes = await contarVistorias();
    await page.getByRole("button", { name: "Registrar Vistoria" }).click();

    // Contagem relativa, não absoluta: os testes deste arquivo dividem o mesmo
    // banco descartável, então "tem 1 vistoria" depende de quem rodou antes —
    // "entrou mais uma" não depende de nada.
    await expect.poll(contarVistorias, { timeout: 20_000 }).toBe(antes + 1);
  });

  /**
   * A rede de proteção da Story 22 (UX-16), exercitada de verdade.
   *
   * Antes dela, uma foto que falhava no upload não impedia nada: a vistoria era
   * gravada sem a evidência do item reprovado, e ninguém ficava sabendo. Aqui o
   * upload falha de fato — o ambiente descartável não tem storage externo, de
   * propósito — e o que se cobra é que NADA seja gravado.
   */
  test("foto de item reprovado que falha no upload bloqueia a vistoria", async ({
    context,
    page,
    baseURL,
  }) => {
    await semearReservaUtilizada();
    await entrarComo(context, ADMIN, baseURL!);

    await page.goto("/admin/vistorias");
    await page.getByRole("button", { name: "Nova Vistoria" }).click();

    await escolherNoSelect(page, "Selecione uma reserva", EMBARCACAO.nome);
    await page.locator("#inspectionDate").fill(hojeIso());
    await escolherNoSelect(page, "Selecione o tipo", "Lancha");

    const aprovados = page.locator('[id$="-aprovado"]');
    const total = await aprovados.count();
    for (let i = 1; i < total; i++) {
      await aprovados.nth(i).click();
    }
    // O primeiro item vai reprovado — é o que faz aparecer o campo de foto.
    await page.locator('[id$="-reprovado"]').first().click();

    const campoFoto = page.locator('input[type="file"]').first();
    await expect(campoFoto).toBeVisible();
    await campoFoto.setInputFiles({
      name: "avaria.png",
      mimeType: "image/png",
      buffer: PNG_MINIMO,
    });

    const antes = await contarVistorias();
    await page.getByRole("button", { name: "Registrar Vistoria" }).click();

    await expect(page.getByText(/Falha no upload/i)).toBeVisible({ timeout: 20_000 });

    // O que importa: nada entrou. Uma vistoria gravada sem a foto do item
    // reprovado é pior do que vistoria nenhuma — fica parecendo completa.
    expect(await contarVistorias()).toBe(antes);
  });
});

test.describe("abastecimento", () => {
  test("o administrador lança um abastecimento e ele chega ao banco", async ({
    context,
    page,
    baseURL,
  }) => {
    await semearReservaUtilizada();
    await entrarComo(context, ADMIN, baseURL!);

    await page.goto("/admin/abastecimento");
    await page.getByRole("button", { name: "Registrar Abastecimento" }).click();

    await escolherNoSelect(page, "Selecione uma reserva", EMBARCACAO.nome);

    // O galão já vem escolhido (o formulário abre no galão 1), então não há o
    // que selecionar — mas vale afirmar qual é, senão o teste passaria a medir
    // outro galão no dia em que esse padrão mudar.
    await expect(page.getByRole("combobox", { name: /Selecione o Galão/i })).toContainText(
      "Galão 1",
    );

    await page.getByRole("spinbutton", { name: /Litros Abastecidos/i }).fill("25.5");
    await page.getByRole("spinbutton", { name: /Preço por Litro/i }).fill("6.5");

    const antes = await contarAbastecimentos();
    await page.getByRole("button", { name: "Registrar", exact: true }).click();

    await expect.poll(contarAbastecimentos, { timeout: 25_000 }).toBe(antes + 1);

    // Abastecimento é dinheiro: um registro com litro certo e preço errado é
    // pior do que registro nenhum. Estas colunas são inteiros em centésimos
    // (25,5 L viram 2550; R$ 6,50 viram 650) — conferir o número cru é o que
    // trava a representação monetária contra uma conversão que se perca.
    const pool = conectar();
    try {
      const [linhas]: any = await pool.query(
        "SELECT `liters`, `price_per_liter`, `total_amount` FROM `fuel_records` ORDER BY `id` DESC LIMIT 1",
      );
      expect(Number(linhas[0].liters)).toBe(2550);
      expect(Number(linhas[0].price_per_liter)).toBe(650);
    } finally {
      await pool.end();
    }
  });
});

async function contarAbastecimentos(): Promise<number> {
  const pool = conectar();
  try {
    const [linhas]: any = await pool.query("SELECT COUNT(*) AS total FROM `fuel_records`");
    return Number(linhas[0].total);
  } finally {
    await pool.end();
  }
}

async function contarVistorias(): Promise<number> {
  const pool = conectar();
  try {
    const [linhas]: any = await pool.query("SELECT COUNT(*) AS total FROM `inspections`");
    return Number(linhas[0].total);
  } finally {
    await pool.end();
  }
}

/** Data de hoje no formato que `<input type="date">` espera. */
function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Abre um select do shadcn e escolhe a opção cujo texto contém `opcao`. */
async function escolherNoSelect(page: any, placeholder: string, opcao: string) {
  await page.getByText(placeholder, { exact: true }).click();
  await page.getByRole("option", { name: new RegExp(opcao, "i") }).first().click();
}
