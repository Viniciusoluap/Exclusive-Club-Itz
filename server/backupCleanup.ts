/**
 * Limpeza dos backups redundantes.
 *
 * POR QUE EXISTE: um defeito fazia o servidor disparar um backup completo a
 * cada start do processo (ver o comentário no fim de `backup.ts`). Numa
 * hospedagem que recicla a instância com frequência, isso acumulou 313 backups
 * numa única noite — todos do mesmo período, todos redundantes.
 *
 * A REGRA: mantém o backup bem-sucedido MAIS RECENTE de cada dia e descarta os
 * outros do mesmo dia. Assim o histórico diário continua inteiro — nenhum dia
 * fica sem backup — e some só a repetição. Registros com falha antigos, que não
 * têm arquivo nenhum, também saem.
 *
 * O backup mais recente de todos NUNCA é removido, aconteça o que acontecer com
 * o resto da regra.
 *
 * LIMITE HONESTO: isto remove os REGISTROS (e o arquivo local, quando existe).
 * Os arquivos enviados ao armazenamento externo permanecem lá — o provedor de
 * storage usado pelo projeto expõe apenas envio e download, não exclusão.
 * Removido o registro, perde-se a referência para aquele arquivo.
 */

import fs from "fs";
import { sql } from "drizzle-orm";

export type CleanupPreview = {
  /** Backups bem-sucedidos redundantes (mesmo dia de um mais novo). */
  duplicados: number;
  /** Registros de falha com mais de 7 dias. */
  falhasAntigas: number;
  /** Total que seria removido. */
  total: number;
  /** Quantos backups sobrariam. */
  restantes: number;
};

/**
 * IDs a remover.
 *
 * O "mais recente do dia" é decidido pelo dia em São Paulo, não em UTC — senão
 * tudo que roda entre 21h e meia-noite conta como o dia seguinte e a regra
 * preserva o backup errado.
 */
async function idsParaRemover(db: any): Promise<{ duplicados: number[]; falhasAntigas: number[] }> {
  const raw = (await db.execute(sql`
    SELECT id, status, started_at,
           DATE(CONVERT_TZ(started_at, '+00:00', '-03:00')) AS dia_sp
    FROM backup_history
    ORDER BY started_at DESC
  `)) as any;
  const rows: any[] = Array.isArray(raw[0]) ? raw[0] : raw;
  const lista = Array.isArray(rows) ? rows : [];

  // Ordenado do mais novo para o mais velho: o primeiro de cada dia é o que fica.
  const idMaisRecente = lista[0]?.id;
  const diaJaPreservado = new Set<string>();
  const duplicados: number[] = [];
  const falhasAntigas: number[] = [];

  const limiteFalhas = Date.now() - 7 * 24 * 60 * 60 * 1000;

  for (const r of lista) {
    if (r.id === idMaisRecente) {
      // Trava absoluta — mas o dia dele PRECISA entrar na lista de preservados,
      // senão o próximo backup do mesmo dia é tratado como o primeiro daquele
      // dia e também escapa, deixando dois no lugar de um.
      diaJaPreservado.add(String(r.dia_sp ?? ""));
      continue;
    }

    if (r.status === "success") {
      const dia = String(r.dia_sp ?? "");
      if (diaJaPreservado.has(dia)) {
        duplicados.push(r.id);
      } else {
        diaJaPreservado.add(dia);
      }
      continue;
    }

    // Falhas e execuções presas: só as antigas, e elas não têm arquivo.
    const quando = new Date(String(r.started_at).replace(" ", "T") + "Z").getTime();
    if (Number.isFinite(quando) && quando < limiteFalhas) {
      falhasAntigas.push(r.id);
    }
  }

  return { duplicados, falhasAntigas };
}

export async function previewCleanup(db: any): Promise<CleanupPreview> {
  const { duplicados, falhasAntigas } = await idsParaRemover(db);

  const raw = (await db.execute(sql`SELECT COUNT(*) AS total FROM backup_history`)) as any;
  const rows = Array.isArray(raw[0]) ? raw[0] : raw;
  const totalAtual = Number(rows?.[0]?.total ?? 0);

  const total = duplicados.length + falhasAntigas.length;
  return {
    duplicados: duplicados.length,
    falhasAntigas: falhasAntigas.length,
    total,
    restantes: totalAtual - total,
  };
}

/**
 * Apaga TODO o histórico de backups.
 *
 * Diferente de `runCleanup`, que preserva um backup por dia, esta função não
 * preserva nada — é o "começar do zero", pedido explicitamente depois que a
 * enxurrada de 313 backups tornou o histórico inútil como registro.
 *
 * Quem chama é responsável por gerar um backup novo em seguida: entre o
 * DELETE e o próximo backup, não existe nenhum ponto de restauração.
 */
export async function runFullCleanup(db: any): Promise<{ removidos: number }> {
  const raw = (await db.execute(
    sql`SELECT id, local_file_path FROM backup_history`,
  )) as any;
  const rows: any[] = Array.isArray(raw[0]) ? raw[0] : raw;
  const lista = Array.isArray(rows) ? rows : [];

  for (const r of lista) {
    const caminho = r?.local_file_path;
    if (!caminho) continue;
    try {
      if (fs.existsSync(caminho)) fs.unlinkSync(caminho);
    } catch (error) {
      console.warn(`[backupCleanup] Não removeu ${caminho}:`, error);
    }
  }

  await db.execute(sql`DELETE FROM backup_history`);
  return { removidos: lista.length };
}

export async function runCleanup(db: any): Promise<{ removidos: number }> {
  const { duplicados, falhasAntigas } = await idsParaRemover(db);
  const ids = [...duplicados, ...falhasAntigas];
  if (ids.length === 0) return { removidos: 0 };

  // Apaga o arquivo local antes do registro — sem o registro perde-se o caminho.
  const raw = (await db.execute(sql`
    SELECT local_file_path FROM backup_history WHERE id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})
  `)) as any;
  const rows: any[] = Array.isArray(raw[0]) ? raw[0] : raw;
  for (const r of Array.isArray(rows) ? rows : []) {
    const caminho = r?.local_file_path;
    if (!caminho) continue;
    try {
      if (fs.existsSync(caminho)) fs.unlinkSync(caminho);
    } catch (error) {
      // Arquivo já sumiu ou está inacessível: não é motivo para abortar a
      // limpeza do registro, que é o que o usuário está vendo na tela.
      console.warn(`[backupCleanup] Não removeu ${caminho}:`, error);
    }
  }

  await db.execute(sql`
    DELETE FROM backup_history WHERE id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})
  `);

  return { removidos: ids.length };
}
