/**
 * Dados mínimos para os fluxos rodarem.
 *
 * DELIBERADAMENTE MÍNIMO: só o que cada fluxo precisa para existir. Semente
 * grande esconde o que o teste realmente depende, e quando ela quebra ninguém
 * sabe qual pedaço importava.
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

/** Cria usuários e uma embarcação. Devolve os ids gerados. */
export async function semear(): Promise<{ embarcacaoId: number }> {
  const pool = conectar();

  try {
    for (const [usuario, papel] of [
      [ADMIN, "admin"],
      [CLIENTE, "user"],
      [FUNCIONARIO, "employee"],
    ] as const) {
      await pool.query(
        "INSERT INTO `users` (`openId`, `name`, `email`, `role`, `loginMethod`) VALUES (?, ?, ?, ?, ?)",
        [usuario.openId, usuario.nome, usuario.email, papel, "e2e"],
      );
    }

    // O cliente também precisa existir na lista de clientes autorizados: é ela
    // que o portal usa para saber de quem é cada cobrança e cada reserva.
    const [clienteResultado]: any = await pool.query(
      "INSERT INTO `allowed_clients` (`email`, `name`, `is_active`) VALUES (?, ?, 1)",
      [CLIENTE.email, CLIENTE.nome],
    );
    const clienteId = Number(clienteResultado.insertId);

    const [resultado]: any = await pool.query(
      "INSERT INTO `vessels` (`name`, `type`, `capacity`, `is_active`) VALUES (?, ?, ?, 1)",
      [EMBARCACAO.nome, EMBARCACAO.tipo, 10],
    );
    const embarcacaoId = Number(resultado.insertId);

    // Sem cota, a tela de reservas não mostra embarcação nenhuma para o
    // cliente (trpc.bookings.myQuotas filtra trpc.vessels.list por isto) —
    // foi o que fez o primeiro rascunho deste teste falhar mesmo com a
    // sessão já aceita.
    await pool.query(
      "INSERT INTO `client_quotas` (`client_id`, `vessel_id`, `quota_type`, `quota_number`, `is_active`) VALUES (?, ?, 'full', 1, 1)",
      [clienteId, embarcacaoId],
    );

    return { embarcacaoId };
  } finally {
    await pool.end();
  }
}
