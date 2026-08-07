/**
 * Backup automático: UMA VEZ POR DIA, e só.
 *
 * POR QUE ESTE TESTE EXISTE: 313 backups nasceram numa única noite. A causa foi
 * um bloco de execução por linha de comando em `backup.ts` cuja condição virava
 * sempre verdadeira depois do empacotamento — cada start do servidor disparava
 * um backup completo, e a hospedagem recicla a instância o tempo todo.
 *
 * A correção principal foi tirar aquela execução do módulo. Este job é a
 * segunda linha de defesa: mesmo que o cron dispare mais de uma vez no mesmo
 * dia (reinício no meio da madrugada, por exemplo), só nasce um backup do dia.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

const runBackup = vi.fn(async () => {});
let dbAtual: any = null;
let backupsHojeNoBanco = 0;

vi.mock("../db", () => ({
  getDb: async () => dbAtual,
}));

vi.mock("../backup", () => ({
  runBackup: () => runBackup(),
}));

const { runScheduledBackup } = await import("./scheduledBackup");

function fakeDb() {
  return {
    async execute() {
      return [[{ total: backupsHojeNoBanco }]];
    },
  };
}

beforeEach(() => {
  runBackup.mockClear();
  backupsHojeNoBanco = 0;
  dbAtual = fakeDb();
});

describe("backup automático diário", () => {
  it("roda quando ainda não há backup bem-sucedido hoje", async () => {
    const r = await runScheduledBackup();

    expect(r.ran).toBe(true);
    expect(runBackup).toHaveBeenCalledTimes(1);
  });

  it("NÃO roda de novo se já existe backup bem-sucedido hoje", async () => {
    // É esta trava que impede a enxurrada quando a instância reinicia.
    backupsHojeNoBanco = 1;

    const r = await runScheduledBackup();

    expect(r.ran).toBe(false);
    expect(r.reason).toContain("já existe backup");
    expect(runBackup).not.toHaveBeenCalled();
  });

  it("uma falha do backup não derruba o processo do servidor", async () => {
    runBackup.mockRejectedValueOnce(new Error("mysqldump indisponível"));

    const r = await runScheduledBackup();

    expect(r.ran).toBe(false);
    expect(r.reason).toContain("mysqldump indisponível");
  });

  it("sem banco disponível, apenas ignora", async () => {
    dbAtual = null;

    const r = await runScheduledBackup();

    expect(r.ran).toBe(false);
    expect(runBackup).not.toHaveBeenCalled();
  });
});

describe("backup.ts não dispara nada ao ser importado", () => {
  it("o módulo não contém execução automática no topo", async () => {
    const { readFileSync } = await import("fs");
    const path = await import("path");
    const fonte = readFileSync(path.join(__dirname, "..", "backup.ts"), "utf8");

    // O padrão exato que causou os 313 backups. Em produção o servidor é
    // empacotado e `import.meta.url` passa a ser a URL do próprio pacote — a
    // mesma coisa que process.argv[1]. A condição era sempre verdadeira.
    expect(fonte).not.toMatch(/import\.meta\.url\s*===\s*`file:\/\/\$\{process\.argv\[1\]\}`/);
  });
});
