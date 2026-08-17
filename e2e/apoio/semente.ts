/**
 * Dados mínimos para os fluxos rodarem.
 *
 * DELIBERADAMENTE MÍNIMO: só o que cada fluxo precisa para existir. Semente
 * grande esconde o que o teste realmente depende, e quando ela quebra ninguém
 * sabe qual pedaço importava.
 *
 * IDEMPOTENTE de propósito: o banco descartável é criado uma vez por execução
 * do Playwright, mas cada arquivo de teste chama `semear()`. Se a semente não
 * tolerasse ser chamada duas vezes, o segundo arquivo morreria com erro de
 * chave duplicada — e a falha apontaria para o teste, não para a semente.
 *
 * Tudo aqui é fictício e vive apenas dentro do banco descartável.
 */

import { conectar } from "./ambiente";

export const ADMIN = {
  openId: "e2e-admin",
  nome: "Administrador de Teste",
  email: "admin.e2e@exemplo.test",
};

export const CLIENTE = {
  openId: "e2e-cliente",
  nome: "Cliente de Teste",
  email: "cliente.e2e@exemplo.test",
};

export const FUNCIONARIO = {
  openId: "e2e-funcionario",
  nome: "Funcionário de Teste",
  email: "funcionario.e2e@exemplo.test",
};

export const EMBARCACAO = {
  nome: "Lancha de Teste",
  tipo: "lancha" as const,
};

export type Semente = {
  embarcacaoId: number;
  clienteId: number;
};

/** Cria usuários, uma embarcação e a cota do cliente. Pode ser chamada N vezes. */
export async function semear(): Promise<Semente> {
  const pool = conectar();

  try {
    for (const [usuario, papel] of [
      [ADMIN, "admin"],
      [CLIENTE, "user"],
      [FUNCIONARIO, "employee"],
    ] as const) {
      await pool.query(
        "INSERT IGNORE INTO `users` (`openId`, `name`, `email`, `role`, `loginMethod`) VALUES (?, ?, ?, ?, ?)",
        [usuario.openId, usuario.nome, usuario.email, papel, "e2e"],
      );
    }

    // O cliente também precisa existir na lista de clientes autorizados: é ela
    // que o portal usa para saber de quem é cada cobrança e cada reserva.
    await pool.query(
      "INSERT IGNORE INTO `allowed_clients` (`email`, `name`, `is_active`) VALUES (?, ?, 1)",
      [CLIENTE.email, CLIENTE.nome],
    );
    const clienteId = await idPor(pool, "SELECT `id` FROM `allowed_clients` WHERE `email` = ?", [
      CLIENTE.email,
    ]);

    await pool.query(
      "INSERT IGNORE INTO `vessels` (`name`, `type`, `capacity`, `is_active`) VALUES (?, ?, ?, 1)",
      [EMBARCACAO.nome, EMBARCACAO.tipo, 10],
    );
    const embarcacaoId = await idPor(pool, "SELECT `id` FROM `vessels` WHERE `name` = ?", [
      EMBARCACAO.nome,
    ]);

    // Sem cota, a tela de reservas não mostra embarcação nenhuma para o
    // cliente (trpc.bookings.myQuotas filtra trpc.vessels.list por isto) —
    // foi o que fez o primeiro rascunho deste teste falhar mesmo com a
    // sessão já aceita.
    const [cotas]: any = await pool.query(
      "SELECT `id` FROM `client_quotas` WHERE `client_id` = ? AND `vessel_id` = ?",
      [clienteId, embarcacaoId],
    );
    if (cotas.length === 0) {
      await pool.query(
        "INSERT INTO `client_quotas` (`client_id`, `vessel_id`, `quota_type`, `quota_number`, `is_active`) VALUES (?, ?, 'full', 1, 1)",
        [clienteId, embarcacaoId],
      );
    }

    // Galão com estoque, para o abastecimento ter de onde tirar combustível.
    const [galoes]: any = await pool.query(
      "SELECT `id` FROM `gallon_stock` WHERE `gallon_number` = 1",
    );
    if (galoes.length === 0) {
      await pool.query(
        "INSERT INTO `gallon_stock` (`gallon_number`, `stock_liters`, `last_price_per_liter`) VALUES (1, 20000, 600)",
      );
    }

    return { embarcacaoId, clienteId };
  } finally {
    await pool.end();
  }
}

/**
 * Uma reserva já utilizada, que é o que vistoria e abastecimento exigem.
 *
 * As duas telas listam apenas reservas com status `used` (`bookings.getRecent`
 * com `onlyUsed`), porque só se vistoria ou abastece o que já saiu. Criar essa
 * reserva pela tela levaria três passos e testaria de novo o que o teste de
 * reserva já cobre — aqui ela é só pré-condição, então entra direto.
 */
export async function semearReservaUtilizada(): Promise<number> {
  const { embarcacaoId } = await semear();
  const pool = conectar();

  try {
    const [existentes]: any = await pool.query(
      "SELECT `id` FROM `bookings` WHERE `client_email` = ? AND `status` = 'used'",
      [CLIENTE.email],
    );
    if (existentes.length > 0) return Number(existentes[0].id);

    const [resultado]: any = await pool.query(
      "INSERT INTO `bookings` (`client_email`, `client_name`, `vessel_id`, `vessel_name`, `booking_date`, `status`) VALUES (?, ?, ?, ?, ?, 'used')",
      [CLIENTE.email, CLIENTE.nome, embarcacaoId, EMBARCACAO.nome, Date.now()],
    );
    return Number(resultado.insertId);
  } finally {
    await pool.end();
  }
}

async function idPor(pool: any, sql: string, params: unknown[]): Promise<number> {
  const [linhas]: any = await pool.query(sql, params);
  if (linhas.length === 0) {
    throw new Error(`Semente não encontrou o registro que acabou de inserir: ${sql}`);
  }
  return Number(linhas[0].id);
}
