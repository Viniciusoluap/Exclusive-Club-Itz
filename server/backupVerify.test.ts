/**
 * A conferência precisa contar CERTO — errar aqui é pior que não conferir.
 *
 * Um verificador que acusa problema onde não há treina o usuário a ignorá-lo,
 * e aí ele não serve para nada no dia em que houver problema de verdade. Por
 * isso os testes abaixo insistem nos casos em que uma implementação ingênua
 * (expressão regular) erraria: texto contendo parênteses, ponto e vírgula,
 * aspas escapadas e quebras de linha.
 */

import { describe, expect, it } from "vitest";
import archiver from "archiver";
import { PassThrough } from "stream";
import {
  extrairSqlDoZip,
  contarLinhasNoDump,
  tabelasNoDump,
  compararComBanco,
} from "./backupVerify";

/** Monta um zip real com o mesmo archiver que o backup usa. */
async function zipCom(nome: string, conteudo: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pedacos: Buffer[] = [];
    const saida = new PassThrough();
    saida.on("data", (d) => pedacos.push(d));
    saida.on("end", () => resolve(Buffer.concat(pedacos)));
    saida.on("error", reject);

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", reject);
    archive.pipe(saida);
    archive.append(conteudo, { name: nome });
    archive.finalize();
  });
}

describe("leitura do zip", () => {
  it("extrai o .sql de um zip gerado pelo mesmo archiver do backup", async () => {
    const dump = "-- Database: test\nCREATE TABLE `users` (id int);\n";
    const zip = await zipCom("database-123.sql", dump);

    expect(extrairSqlDoZip(zip)).toBe(dump);
  });

  it("acha o .sql mesmo com outros arquivos no zip", async () => {
    const zip = await new Promise<Buffer>((resolve, reject) => {
      const pedacos: Buffer[] = [];
      const saida = new PassThrough();
      saida.on("data", (d) => pedacos.push(d));
      saida.on("end", () => resolve(Buffer.concat(pedacos)));
      const a = archiver("zip", { zlib: { level: 9 } });
      a.on("error", reject);
      a.pipe(saida);
      a.append("conteúdo do manifesto", { name: "MANIFESTO.txt" });
      a.append("CREATE TABLE `x` (id int);", { name: "dump.sql" });
      a.finalize();
    });

    expect(extrairSqlDoZip(zip)).toContain("CREATE TABLE `x`");
  });

  it("recusa um arquivo que não é zip, em vez de devolver lixo", () => {
    expect(() => extrairSqlDoZip(Buffer.from("isto não é um zip"))).toThrow(/ZIP/i);
  });
});

describe("contagem de linhas no dump", () => {
  it("conta as linhas de cada tabela", () => {
    const dump = `
CREATE TABLE \`users\` (id int);
INSERT INTO \`users\` (\`id\`, \`nome\`) VALUES
(1, 'Ana'),
(2, 'Bruno'),
(3, 'Carla');
CREATE TABLE \`vessels\` (id int);
INSERT INTO \`vessels\` (\`id\`) VALUES
(10),
(11);
`;
    const c = contarLinhasNoDump(dump);
    expect(c.get("users")).toBe(3);
    expect(c.get("vessels")).toBe(2);
  });

  it("soma vários INSERTs da mesma tabela (o dump grava em lotes de 100)", () => {
    const dump = `
INSERT INTO \`bookings\` (\`id\`) VALUES
(1),
(2);
INSERT INTO \`bookings\` (\`id\`) VALUES
(3);
`;
    expect(contarLinhasNoDump(dump).get("bookings")).toBe(3);
  });

  it("NÃO se confunde com parênteses dentro de texto", () => {
    // Uma regex contando '(' acharia 4 linhas aqui, não 2.
    const dump = `
INSERT INTO \`inspections\` (\`id\`, \`obs\`) VALUES
(1, 'casco (bombordo) avariado'),
(2, 'motor (revisar) e hélice (trocar)');
`;
    expect(contarLinhasNoDump(dump).get("inspections")).toBe(2);
  });

  it("NÃO termina a contagem num ponto e vírgula dentro de texto", () => {
    // Se o ';' do texto encerrasse o bloco, a terceira linha sumiria.
    const dump = `
INSERT INTO \`notes\` (\`id\`, \`txt\`) VALUES
(1, 'primeiro; segundo'),
(2, 'x'),
(3, 'y');
`;
    expect(contarLinhasNoDump(dump).get("notes")).toBe(3);
  });

  it("entende aspas escapadas por duplicação", () => {
    const dump = `
INSERT INTO \`clients\` (\`id\`, \`nome\`) VALUES
(1, 'D''Ávila'),
(2, 'O''Brien');
`;
    expect(contarLinhasNoDump(dump).get("clients")).toBe(2);
  });

  it("aguenta quebra de linha dentro de um campo de texto", () => {
    // O gerador do dump não escapa '\\n'; um campo de observação com quebra de
    // linha coloca uma quebra literal no SQL. Contar por linha erraria.
    const dump =
      "INSERT INTO `obs` (`id`, `t`) VALUES\n(1, 'linha um\n(continua) linha dois'),\n(2, 'ok');\n";
    expect(contarLinhasNoDump(dump).get("obs")).toBe(2);
  });

  it("tabela declarada sem nenhuma linha conta zero, não some", () => {
    const dump = "CREATE TABLE `vazia` (id int);\n";
    expect(tabelasNoDump(dump).has("vazia")).toBe(true);
    expect(contarLinhasNoDump(dump).get("vazia")).toBeUndefined();
  });
});

/** Estado do banco no formato que a comparação espera. */
function tabelas(
  contagens: Record<string, number>,
  extras: Record<string, { ehView?: boolean; linhasNoInstante?: number | null }> = {},
) {
  const m = new Map<string, { linhas: number; ehView: boolean; linhasNoInstante: number | null }>();
  for (const [nome, linhas] of Object.entries(contagens)) {
    m.set(nome, {
      linhas,
      ehView: extras[nome]?.ehView ?? false,
      linhasNoInstante: extras[nome]?.linhasNoInstante ?? null,
    });
  }
  return m;
}

describe("comparação com o banco vivo", () => {
  const dumpCompleto = `
CREATE TABLE \`users\` (id int);
INSERT INTO \`users\` (\`id\`) VALUES
(1),
(2);
CREATE TABLE \`vessels\` (id int);
INSERT INTO \`vessels\` (\`id\`) VALUES
(10);
CREATE TABLE \`logs\` (id int);
`;

  it("considera íntegro quando todas as tabelas estão no backup", () => {
    const banco = tabelas({ users: 2, vessels: 1, logs: 0 });
    const r = compararComBanco(banco, dumpCompleto);

    expect(r.integro).toBe(true);
    expect(r.problemas).toEqual([]);
    expect(r.tabelasNoBanco).toBe(3);
    expect(r.registrosNoBackup).toBe(3);
  });

  it("continua íntegro se o banco tem MAIS linhas que o backup", () => {
    // O backup é uma foto de um instante: dado criado depois dele não está lá,
    // e isso não é defeito. Um alarme aqui dispararia em todo backup.
    const banco = tabelas({ users: 57, vessels: 1, logs: 0 });
    const r = compararComBanco(banco, dumpCompleto);

    expect(r.integro).toBe(true);
  });

  it("acusa tabela AUSENTE do backup", () => {
    const banco = tabelas({ users: 2, vessels: 1, logs: 0, bpo_charges: 400 });
    const r = compararComBanco(banco, dumpCompleto);

    expect(r.integro).toBe(false);
    expect(r.problemas.map((p) => p.tabela)).toEqual(["bpo_charges"]);
    expect(r.problemas[0].ausente).toBe(true);
  });

  it("acusa tabela que tinha dados e veio VAZIA no backup", () => {
    // Estrutura presente, conteúdo não: o caso mais traiçoeiro, porque o
    // backup parece completo até a hora de precisar dele.
    const dumpSemDados = "CREATE TABLE `users` (id int);\n";
    const banco = tabelas({ users: 500 });
    const r = compararComBanco(banco, dumpSemDados);

    expect(r.integro).toBe(false);
    expect(r.problemas[0].vaziaNoBackup).toBe(true);
    expect(r.problemas[0].noBanco).toBe(500);
  });

  it("tabela vazia dos dois lados não é problema", () => {
    const banco = tabelas({ logs: 0 });
    const r = compararComBanco(banco, "CREATE TABLE `logs` (id int);\n");

    expect(r.integro).toBe(true);
  });

  it("não acusa linhas que nasceram DEPOIS do backup", () => {
    // O caso real: o backup rodou às 10:01 com a tabela vazia, os 243 anexos
    // foram arquivados às 10:10, e a conferência das 10:17 dizia "243 no banco,
    // nenhum no backup". Perda de dado nenhuma — só a ordem dos fatos.
    const banco = tabelas(
      { backup_attachments: 243 },
      { backup_attachments: { linhasNoInstante: 0 } },
    );
    const r = compararComBanco(banco, "CREATE TABLE `backup_attachments` (id int);\n");

    expect(r.integro).toBe(true);
    expect(r.problemas).toEqual([]);
  });

  it("continua acusando quando o dado JÁ EXISTIA no instante do backup", () => {
    // A contrapartida do teste acima: se a linha existia quando o backup rodou
    // e mesmo assim não está no arquivo, isso é perda de dado de verdade.
    const banco = tabelas({ bpo_charges: 3163 }, { bpo_charges: { linhasNoInstante: 3163 } });
    const r = compararComBanco(banco, "CREATE TABLE `bpo_charges` (id int);\n");

    expect(r.integro).toBe(false);
    expect(r.problemas[0].vaziaNoBackup).toBe(true);
  });

  it("reconhece uma VIEW no backup e não cobra linhas dela", () => {
    // A definição real que o MySQL devolve tem cláusulas entre CREATE e VIEW.
    // Procurar "CREATE VIEW" literal não acharia nenhuma view de verdade, e
    // toda view seria acusada de ausente — que foi o que aconteceu.
    const dump =
      "CREATE TABLE `bpo_charges` (id int);\n" +
      "INSERT INTO `bpo_charges` (`id`) VALUES\n(1);\n" +
      "DROP VIEW IF EXISTS `financial_charges`;\n" +
      "CREATE ALGORITHM=UNDEFINED SQL SECURITY DEFINER VIEW `financial_charges` AS select 1;\n";

    const banco = tabelas(
      { bpo_charges: 1, financial_charges: 207 },
      { financial_charges: { ehView: true } },
    );
    const r = compararComBanco(banco, dump);

    expect(r.integro).toBe(true);
    expect(r.detalhes.find((d) => d.tabela === "financial_charges")?.ausente).toBe(false);
  });

  it("acusa uma VIEW que ficou de fora do backup", () => {
    // Ignorar a contagem de linhas de uma view não pode virar ignorar a view.
    // Sem a definição, a restauração perde o objeto.
    const banco = tabelas({ financial_charges: 207 }, { financial_charges: { ehView: true } });
    const r = compararComBanco(banco, "CREATE TABLE `bpo_charges` (id int);\n");

    expect(r.integro).toBe(false);
    expect(r.problemas[0].ausente).toBe(true);
  });
});

/**
 * Caminho completo, com o banco de verdade.
 *
 * Os testes acima usam dumps escritos à mão. Este gera um dump REAL pelo mesmo
 * código do backup, empacota, criptografa, e refaz todo o percurso de volta —
 * é o mais próximo de um ensaio de restauração sem restaurar nada.
 */
describe.skipIf(!(await import("./db")).getDb().then(() => false).catch(() => true))(
  "ida e volta com o banco real",
  () => {
    it("um dump gerado agora confere com o banco que o originou", async () => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) return;

      const { exportDatabaseToSQL } = await import("./databaseBackup");
      const { encryptBackupBuffer, decryptBackupBuffer } = await import("./backup");
      const { contarLinhasNoBanco } = await import("./backupVerify");
      const fs = await import("fs");
      const os = await import("os");
      const path = await import("path");

      const caminho = path.join(os.tmpdir(), `verify-${Date.now()}.sql`);
      try {
        await exportDatabaseToSQL(caminho);
        const dumpOriginal = fs.readFileSync(caminho, "utf8");

        // Empacota e criptografa exatamente como o backup faz.
        const zip = await zipCom("database.sql", dumpOriginal);
        const chave = Buffer.from("chave-de-teste-com-mais-de-32-caracteres!", "utf8");
        const cifrado = encryptBackupBuffer(zip, chave);

        // ...e refaz o caminho de volta.
        const decifrado = decryptBackupBuffer(cifrado, chave);
        const dumpRecuperado = extrairSqlDoZip(decifrado);
        expect(dumpRecuperado).toBe(dumpOriginal);

        // A ESTRUTURA é o que se pode afirmar com segurança aqui: outros
        // arquivos de teste escrevem neste mesmo banco em paralelo, então
        // comparar CONTAGENS entre o instante do dump e o instante da
        // conferência seria uma corrida — o teste falharia por motivo alheio
        // ao que ele deveria proteger, e um teste que falha à toa acaba
        // ignorado. Criação e remoção de tabelas, não; isso é estável.
        const noBanco = await contarLinhasNoBanco(db);
        const r = compararComBanco(noBanco, dumpRecuperado);

        const ausentes = r.problemas.filter((p) => p.ausente).map((p) => p.tabela);
        expect(ausentes).toEqual([]);
        expect(r.tabelasNoBackup).toBeGreaterThanOrEqual(r.tabelasNoBanco);
      } finally {
        if (fs.existsSync(caminho)) fs.unlinkSync(caminho);
      }
    });
  },
);
