/**
 * O percentual precisa refletir trabalho concluído, não tempo decorrido.
 *
 * POR QUE ISSO IMPORTA: uma barra cronometrada sobe bonitinho mesmo com o
 * processo morto — e travar é exatamente o que já aconteceu com este backup
 * mais de uma vez. Uma barra que mente é pior que nenhuma barra, porque
 * substitui a dúvida por uma certeza falsa.
 *
 * Aqui ficam travadas as propriedades que garantem isso: o avanço acompanha as
 * tabelas concluídas, é monotônico, respeita os limites da faixa e não estoura
 * com entradas degeneradas.
 */

import { describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { FASES, ensureProgressColumns, percentualDaExportacao, setProgress } from "./backupProgress";

const db = await getDb();

async function colunasDeProgresso(): Promise<string[]> {
  const raw = (await db!.execute(sql`
    SELECT COLUMN_NAME FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'backup_history'
      AND COLUMN_NAME IN ('progress_percent', 'progress_step')
    ORDER BY COLUMN_NAME
  `)) as any;
  const rows = Array.isArray(raw[0]) ? raw[0] : raw;
  return (Array.isArray(rows) ? rows : []).map((r: any) =>
    String(r.COLUMN_NAME ?? r.column_name ?? ""),
  );
}

describe.skipIf(!db)("colunas de progresso sem a migração aplicada", () => {
  it("cria as colunas quando faltam — o caso de produção", async () => {
    // A hospedagem publica o código mas não roda migrações. Sem isto, a
    // primeira gravação de progresso derrubaria o backup por coluna ausente:
    // trocaria um incômodo visual por uma falha real.
    await db!.execute(sql`ALTER TABLE backup_history DROP COLUMN progress_percent`).catch(() => {});
    await db!.execute(sql`ALTER TABLE backup_history DROP COLUMN progress_step`).catch(() => {});
    expect(await colunasDeProgresso()).toEqual([]);

    await ensureProgressColumns(db);

    expect(await colunasDeProgresso()).toEqual(["progress_percent", "progress_step"]);
  });

  it("é idempotente: rodar de novo com as colunas presentes não quebra", async () => {
    await ensureProgressColumns(db);
    await ensureProgressColumns(db);
    expect(await colunasDeProgresso()).toEqual(["progress_percent", "progress_step"]);
  });
});

describe("percentual da exportação", () => {
  it("começa no início da faixa quando nada foi exportado", () => {
    expect(percentualDaExportacao(0, 40)).toBe(FASES.EXPORT_INICIO.percent);
  });

  it("chega ao fim da faixa quando todas as tabelas terminaram", () => {
    expect(percentualDaExportacao(40, 40)).toBe(FASES.EXPORT_FIM.percent);
  });

  it("na metade das tabelas, fica na metade da faixa", () => {
    const meio = percentualDaExportacao(20, 40);
    const esperado = (FASES.EXPORT_INICIO.percent + FASES.EXPORT_FIM.percent) / 2;
    expect(meio).toBe(Math.round(esperado));
  });

  it("nunca retrocede conforme as tabelas avançam", () => {
    // Uma barra que anda para trás faz o usuário duvidar de tudo o que ela diz.
    let anterior = -1;
    for (let feitas = 0; feitas <= 34; feitas++) {
      const atual = percentualDaExportacao(feitas, 34);
      expect(atual).toBeGreaterThanOrEqual(anterior);
      anterior = atual;
    }
  });

  it("permanece dentro da faixa da exportação, sem invadir as etapas seguintes", () => {
    // Se passasse de EXPORT_FIM, a barra mostraria "compactando" antes de
    // terminar de exportar — e depois voltaria.
    for (let feitas = 0; feitas <= 100; feitas++) {
      const p = percentualDaExportacao(feitas, 100);
      expect(p).toBeGreaterThanOrEqual(FASES.EXPORT_INICIO.percent);
      expect(p).toBeLessThanOrEqual(FASES.EXPORT_FIM.percent);
    }
  });

  it("não estoura com zero tabelas nem com contagens incoerentes", () => {
    expect(percentualDaExportacao(0, 0)).toBe(FASES.EXPORT_INICIO.percent);
    // Mais "feitas" que o total não pode gerar percentual acima da faixa.
    expect(percentualDaExportacao(99, 10)).toBe(FASES.EXPORT_FIM.percent);
    expect(percentualDaExportacao(-5, 10)).toBe(FASES.EXPORT_INICIO.percent);
  });
});

describe("as fases avançam sempre para frente", () => {
  it("cada etapa tem percentual maior que a anterior", () => {
    const ordem = [
      FASES.INICIO,
      FASES.EXPORT_INICIO,
      FASES.EXPORT_FIM,
      FASES.ZIP,
      FASES.CRIPTOGRAFIA,
      FASES.UPLOAD,
      FASES.LIMPEZA,
    ];
    for (let i = 1; i < ordem.length; i++) {
      expect(ordem[i].percent).toBeGreaterThan(ordem[i - 1].percent);
    }
    expect(ordem[ordem.length - 1].percent).toBeLessThan(100);
  });
});

describe("gravação do progresso", () => {
  it("uma falha ao gravar NÃO derruba o backup", async () => {
    // Percentual não salvo é um incômodo; backup interrompido porque o
    // percentual não pôde ser salvo é um estrago.
    const db = {
      execute: vi.fn().mockRejectedValue(new Error("coluna inexistente")),
    };

    await expect(setProgress(db, 1, 50, "Exportando")).resolves.toBeUndefined();
    expect(db.execute).toHaveBeenCalled();
  });

  it("não tenta gravar sem banco ou sem id do backup", async () => {
    const db = { execute: vi.fn() };

    await setProgress(null, 1, 50, "x");
    await setProgress(db, null, 50, "x");

    expect(db.execute).not.toHaveBeenCalled();
  });
});
