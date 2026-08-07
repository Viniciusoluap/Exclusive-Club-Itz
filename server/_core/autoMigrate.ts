/**
 * Aplicação automática de migrações na subida do servidor.
 *
 * POR QUE EXISTE: a hospedagem publica o código novo mas NÃO roda migrações.
 * Isso já custou dois defeitos nesta auditoria (a tabela de anexos e as colunas
 * de progresso), cada um contornado com um `CREATE TABLE IF NOT EXISTS` ou
 * `ALTER TABLE` avulso dentro do código de negócio. Essa pilha de remendos
 * cresce a cada mudança de schema e é ela mesma um risco: cada remendo é uma
 * chance a mais de alguém esquecer o próximo.
 *
 * O PERIGO DE SIMPLESMENTE RODAR `migrate`: o banco de produção recebeu seu
 * schema por `drizzle-kit push --force` nas fases iniciais, então a tabela de
 * controle `__drizzle_migrations` pode estar vazia enquanto as tabelas já
 * existem. Rodar o migrador nesse estado tentaria aplicar o baseline inteiro e
 * quebraria com "table already exists" — e um servidor que não sobe é bem pior
 * que uma migração pendente.
 *
 * A SAÍDA — ADOÇÃO DE BASELINE: se o controle está vazio mas o banco já tem
 * tabelas, isto é um banco existente sendo adotado. Nesse caso as migrações
 * atuais são MARCADAS como aplicadas, sem executar nenhum DDL. A partir daí, só
 * as migrações NOVAS rodam — que é o comportamento desejado desde o início.
 *
 * Isto nunca executa DDL destrutivo num banco adotado: no caminho de adoção só
 * se escreve na tabela de controle.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { sql } from "drizzle-orm";

export type ResultadoMigracao = {
  /** Estado encontrado: banco novo, adotado, ou já sob controle. */
  situacao: "banco-novo" | "baseline-adotado" | "ja-controlado" | "indisponivel";
  aplicadas: string[];
  marcadasSemExecutar: string[];
  erro?: string;
};

/** Lê o journal do drizzle na ordem em que as migrações devem ser aplicadas. */
export function lerJournal(pastaDrizzle: string): Array<{ tag: string; arquivo: string }> {
  const journalPath = path.join(pastaDrizzle, "meta", "_journal.json");
  if (!fs.existsSync(journalPath)) return [];

  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
  const entradas: Array<{ idx: number; tag: string }> = journal?.entries ?? [];

  return entradas
    .slice()
    .sort((a, b) => a.idx - b.idx)
    .map((e) => ({ tag: e.tag, arquivo: path.join(pastaDrizzle, `${e.tag}.sql`) }))
    .filter((m) => fs.existsSync(m.arquivo));
}

/**
 * Divide o arquivo de migração nas instruções individuais.
 *
 * O drizzle separa com `--> statement-breakpoint`. Sem isso, o driver receberia
 * várias instruções numa tacada só e recusaria.
 */
export function separarInstrucoes(conteudo: string): string[] {
  return conteudo
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Mesmo hash que o drizzle-kit usa para identificar a migração. */
function hashDaMigracao(conteudo: string): string {
  return crypto.createHash("sha256").update(conteudo).digest("hex");
}

async function garantirTabelaDeControle(db: any): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS \`__drizzle_migrations\` (
      \`id\` serial PRIMARY KEY,
      \`hash\` text NOT NULL,
      \`created_at\` bigint
    )
  `);
}

async function hashesAplicados(db: any): Promise<Set<string>> {
  const raw = (await db.execute(sql`SELECT hash FROM \`__drizzle_migrations\``)) as any;
  const rows = Array.isArray(raw[0]) ? raw[0] : raw;
  return new Set((Array.isArray(rows) ? rows : []).map((r: any) => String(r.hash)));
}

/** O banco já tem tabelas de negócio (ou seja, não é um banco vazio)? */
async function bancoJaTemTabelas(db: any): Promise<boolean> {
  const raw = (await db.execute(sql`
    SELECT COUNT(*) AS total FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME <> '__drizzle_migrations'
  `)) as any;
  const rows = Array.isArray(raw[0]) ? raw[0] : raw;
  return Number(rows?.[0]?.total ?? 0) > 0;
}

async function registrar(db: any, hash: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO \`__drizzle_migrations\` (\`hash\`, \`created_at\`) VALUES (${hash}, ${Date.now()})
  `);
}

export async function aplicarMigracoesPendentes(
  db: any,
  pastaDrizzle: string,
): Promise<ResultadoMigracao> {
  if (!db) return { situacao: "indisponivel", aplicadas: [], marcadasSemExecutar: [] };

  const aplicadas: string[] = [];
  const marcadasSemExecutar: string[] = [];

  try {
    const migracoes = lerJournal(pastaDrizzle);
    if (migracoes.length === 0) {
      return { situacao: "ja-controlado", aplicadas, marcadasSemExecutar };
    }

    const controleExistiaAntes = await (async () => {
      const raw = (await db.execute(sql`
        SELECT COUNT(*) AS total FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '__drizzle_migrations'
      `)) as any;
      const rows = Array.isArray(raw[0]) ? raw[0] : raw;
      return Number(rows?.[0]?.total ?? 0) > 0;
    })();

    await garantirTabelaDeControle(db);
    const jaAplicadas = await hashesAplicados(db);
    const temTabelas = await bancoJaTemTabelas(db);

    // Banco existente, sem histórico de migrações: adoção de baseline.
    // Marca tudo que existe hoje como aplicado, SEM executar nada.
    const adotarBaseline = jaAplicadas.size === 0 && temTabelas && !controleExistiaAntes;

    for (const m of migracoes) {
      const conteudo = fs.readFileSync(m.arquivo, "utf8");
      const hash = hashDaMigracao(conteudo);
      if (jaAplicadas.has(hash)) continue;

      if (adotarBaseline) {
        await registrar(db, hash);
        marcadasSemExecutar.push(m.tag);
        continue;
      }

      for (const instrucao of separarInstrucoes(conteudo)) {
        await db.execute(sql.raw(instrucao));
      }
      await registrar(db, hash);
      aplicadas.push(m.tag);
    }

    const situacao: ResultadoMigracao["situacao"] = adotarBaseline
      ? "baseline-adotado"
      : temTabelas
        ? "ja-controlado"
        : "banco-novo";

    return { situacao, aplicadas, marcadasSemExecutar };
  } catch (error) {
    // Um servidor que não sobe é pior que uma migração pendente. O erro é
    // registrado e aparece no diagnóstico; o servidor continua de pé.
    const erro = error instanceof Error ? error.message : String(error);
    console.error("[autoMigrate] Falha ao aplicar migrações:", erro);
    return { situacao: "indisponivel", aplicadas, marcadasSemExecutar, erro };
  }
}
