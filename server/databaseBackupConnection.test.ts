/**
 * A conexão do backup não pode depender de o servidor falar SSL.
 *
 * POR QUE ESTE TESTE EXISTE: o backup exigia SSL de forma incondicional. O
 * TiDB Cloud de produção aceita, então lá funcionava — e por isso o defeito
 * ficou invisível até o CI quebrar com "Server does not support secure
 * connection", uma mensagem que não menciona backup e manda procurar no lugar
 * errado.
 *
 * O que precisa ficar travado é a assimetria: SSL é tentado primeiro (produção
 * depende disso), a queda para conexão simples acontece SÓ na recusa de
 * handshake, e qualquer outro erro sobe intacto — senha errada não pode virar
 * "servidor sem SSL".
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

const createConnection = vi.fn();

vi.mock("mysql2/promise", () => ({
  default: { createConnection: (cfg: any) => createConnection(cfg) },
}));

const { connectForBackup } = await import("./databaseBackup");

const CONFIG = { host: "h", port: 3306, user: "u", password: "p", database: "d" };

function erro(code: string) {
  const e: any = new Error(code);
  e.code = code;
  return e;
}

beforeEach(() => createConnection.mockReset());

describe("conexão do backup", () => {
  it("usa SSL quando o servidor aceita", async () => {
    createConnection.mockResolvedValueOnce("conexao-com-ssl");

    const c = await connectForBackup(CONFIG);

    expect(c).toBe("conexao-com-ssl");
    expect(createConnection).toHaveBeenCalledTimes(1);
    expect(createConnection.mock.calls[0][0].ssl).toEqual({ rejectUnauthorized: false });
  });

  it("cai para conexão simples quando o servidor recusa o handshake SSL", async () => {
    createConnection
      .mockRejectedValueOnce(erro("HANDSHAKE_NO_SSL_SUPPORT"))
      .mockResolvedValueOnce("conexao-sem-ssl");

    const c = await connectForBackup(CONFIG);

    expect(c).toBe("conexao-sem-ssl");
    expect(createConnection).toHaveBeenCalledTimes(2);
    // A segunda tentativa não pode levar `ssl` — é o que a torna diferente.
    expect(createConnection.mock.calls[1][0].ssl).toBeUndefined();
  });

  it("NÃO mascara outros erros de conexão", async () => {
    // Credencial errada precisa continuar sendo credencial errada. Se o
    // fallback engolisse qualquer falha, o backup tentaria de novo sem SSL e
    // devolveria uma mensagem que aponta para o problema errado.
    createConnection.mockRejectedValueOnce(erro("ER_ACCESS_DENIED_ERROR"));

    await expect(connectForBackup(CONFIG)).rejects.toMatchObject({
      code: "ER_ACCESS_DENIED_ERROR",
    });
    expect(createConnection).toHaveBeenCalledTimes(1);
  });

  it("host inacessível também sobe, sem segunda tentativa", async () => {
    createConnection.mockRejectedValueOnce(erro("ECONNREFUSED"));

    await expect(connectForBackup(CONFIG)).rejects.toMatchObject({ code: "ECONNREFUSED" });
    expect(createConnection).toHaveBeenCalledTimes(1);
  });
});
