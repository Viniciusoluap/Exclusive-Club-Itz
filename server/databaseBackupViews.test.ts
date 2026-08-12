/**
 * Um backup só serve se restaurar. Este teste restaura.
 *
 * O DEFEITO QUE ORIGINOU ESTE ARQUIVO: o banco de produção tem uma view legada
 * (`financial_charges`) que nenhum código usa. O exportador listava tudo com
 * `SHOW TABLES` — que devolve views misturadas com tabelas — e chamava
 * `SHOW CREATE TABLE` nelas. Numa view isso não devolve DDL nenhum, e o
 * `undefined` do JavaScript era gravado dentro do arquivo:
 *
 *     DROP TABLE IF EXISTS `financial_charges`;
 *     undefined;
 *     INSERT INTO `financial_charges` (`id`, `valor`) VALUES (1, '10.00');
 *
 * O backup era marcado como SUCESSO. Só que `undefined;` é erro de sintaxe: a
 * restauração parava ali (ERROR 1064) e nada depois daquela linha entrava. O
 * sistema tinha meses de backups que não restauravam, e nada acusava.
 *
 * Por isso este teste não confere o texto do arquivo: ele RESTAURA num banco
 * limpo e verifica o que chegou lá. É a única pergunta que importa.
 */

import { describe, expect, it, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { createPool } from "mysql2/promise";
import { exportDatabaseToSQL, semDefiner } from "./databaseBackup";

const URL_BASE = process.env.DATABASE_URL ?? "";
const temBanco = URL_BASE.startsWith("mysql://");

const criados: string[] = [];

function urlPara(nome: string): string {
  return URL_BASE.replace(/\/[^/?]+(\?|$)/, `/${nome}$1`);
}

async function criarBanco(nome: string) {
  const admin = createPool(URL_BASE);
  await admin.query(`DROP DATABASE IF EXISTS \`${nome}\``);
  await admin.query(`CREATE DATABASE \`${nome}\``);
  await admin.end();
  criados.push(nome);
}

afterEach(async () => {
  if (!temBanco) return;
  const admin = createPool(URL_BASE);
  for (const nome of criados.splice(0)) {
    await admin.query(`DROP DATABASE IF EXISTS \`${nome}\``);
  }
  await admin.end();
});

/** Executa o dump inteiro, statement a statement, como uma restauração faria. */
async function restaurar(nome: string, dump: string) {
  const pool = createPool({ uri: urlPara(nome), multipleStatements: true });
  try {
    await pool.query(dump);
  } finally {
    await pool.end();
  }
}

describe.skipIf(!temBanco)("backup de banco com view", () => {
  it("gera um arquivo que restaura, com a view preservada e sem dado duplicado", async () => {
    const origem = `bkpview_o_${Date.now()}`;
    const destino = `bkpview_d_${Date.now()}`;
    await criarBanco(origem);
    await criarBanco(destino);

    const pool = createPool(urlPara(origem));
    await pool.query("CREATE TABLE `bpo_charges` (`id` INT PRIMARY KEY, `valor` DECIMAL(10,2))");
    await pool.query("INSERT INTO `bpo_charges` VALUES (1, 10.00), (2, 20.00)");
    // A view legada, igual à de produção: lê de uma tabela real.
    await pool.query("CREATE VIEW `financial_charges` AS SELECT `id`, `valor` FROM `bpo_charges`");
    await pool.end();

    const arquivo = path.join(os.tmpdir(), `dump-view-${Date.now()}.sql`);
    const urlAnterior = process.env.DATABASE_URL;
    process.env.DATABASE_URL = urlPara(origem);
    try {
      await exportDatabaseToSQL(arquivo);
    } finally {
      process.env.DATABASE_URL = urlAnterior;
    }

    const dump = fs.readFileSync(arquivo, "utf8");
    fs.unlinkSync(arquivo);

    // A assinatura exata do defeito, para que ele não volte por outro caminho.
    expect(dump).not.toContain("undefined;");
    // View não tem dado próprio: inserir nela duplicaria o que já veio da tabela.
    expect(dump).not.toContain("INSERT INTO `financial_charges`");

    // A prova: restaurar num banco limpo. Se o arquivo estiver inválido, aqui
    // estoura — que é exatamente o que acontecia antes da correção.
    await restaurar(destino, dump);

    const conferencia = createPool(urlPara(destino));
    const [objetos] = await conferencia.query<any[]>("SHOW FULL TABLES");
    const porNome = new Map(
      objetos.map((o: any) => {
        const v = Object.values(o);
        return [String(v[0]), String(v[1])];
      }),
    );

    expect(porNome.get("bpo_charges")).toBe("BASE TABLE");
    expect(porNome.get("financial_charges")).toBe("VIEW");

    // A view precisa FUNCIONAR depois de restaurada, não só existir.
    const [linhas] = await conferencia.query<any[]>("SELECT COUNT(*) AS total FROM `financial_charges`");
    expect(Number(linhas[0].total)).toBe(2);

    const [dados] = await conferencia.query<any[]>("SELECT COUNT(*) AS total FROM `bpo_charges`");
    expect(Number(dados[0].total)).toBe(2);

    await conferencia.end();
  }, 60000);
});

describe("remoção do DEFINER", () => {
  it("tira o dono da definição da view", () => {
    // O definer aponta para um usuário do servidor de origem. Restaurar num
    // servidor novo — o cenário de desastre — falharia com "user does not exist".
    const ddl =
      "CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER " +
      "VIEW `financial_charges` AS select 1";

    const limpo = semDefiner(ddl);

    expect(limpo).not.toContain("DEFINER=`root`@`localhost`");
    expect(limpo).toContain("VIEW `financial_charges`");
    expect(limpo).toContain("select 1");
  });

  it("não altera uma definição que já não tem definer", () => {
    const ddl = "CREATE ALGORITHM=UNDEFINED SQL SECURITY INVOKER VIEW `v` AS select 1";
    expect(semDefiner(ddl)).toBe(ddl);
  });
});
