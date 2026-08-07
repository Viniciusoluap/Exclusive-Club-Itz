/**
 * Arquivamento INCREMENTAL de anexos.
 *
 * POR QUE EXISTE: incluir todas as fotos e documentos dentro do zip do backup
 * fez o processo passar de 43 segundos para vários minutos. O trabalho roda em
 * segundo plano, depois que a resposta HTTP já foi enviada, e nesta hospedagem
 * a instância não sobrevive tanto tempo — o backup morria no meio e nada era
 * salvo. Nem o banco.
 *
 * A saída: separar as duas coisas.
 *   - O backup do banco volta a ser só o dump (rápido e confiável).
 *   - Os anexos são arquivados à parte, em LOTES CURTOS, e cada arquivo é
 *     processado UMA ÚNICA VEZ na vida.
 *
 * Fotos e documentos são estáticos: uma foto de abastecimento de julho não muda
 * mais. Então rebaixá-las todo dia era desperdício. Depois da primeira varredura
 * do acervo, cada execução tem só alguns arquivos novos e termina em segundos.
 *
 * SEGURANÇA: cada arquivo é criptografado com a mesma chave do backup antes de
 * ir para o storage — são documentos pessoais e contratos. E toda URL passa
 * pelo guard de SSRF antes do download, porque vem do banco.
 */

import axios from "axios";
import { sql } from "drizzle-orm";
import { assertSafeExternalUrl } from "./_core/urlSafety";
import { collectAttachments, type Attachment } from "./backupFiles";
import { getBackupEncryptionKey, encryptBackupBuffer } from "./backup";
import { storagePut } from "./storage";

const MAX_FILE_BYTES = 25 * 1024 * 1024;

/**
 * Teto de tempo de UMA requisição de arquivamento.
 *
 * POR QUE ISSO EXISTE: o lote era de 5 arquivos, número fixo. Cinco fotos
 * pequenas terminam em segundos; cinco fotos grandes levam minutos — e aí o
 * proxy da hospedagem encerra a requisição e devolve uma página de erro HTML,
 * que o navegador não consegue interpretar. Contar arquivos não controla tempo:
 * o que importa não é quantos arquivos são, é quanto tempo levam.
 *
 * Com um orçamento de tempo o lote se adapta sozinho — muitos arquivos quando
 * são leves, poucos quando são pesados — e nunca ultrapassa a janela da
 * requisição, seja qual for o acervo.
 */
const BUDGET_MS = 12000;
const DOWNLOAD_TIMEOUT_MS = 10000;

export type ArchiveProgress = {
  /** Anexos referenciados no banco. */
  total: number;
  /** Já arquivados com sucesso (acumulado, todas as execuções). */
  archived: number;
  /** Que falharam e não serão retentados automaticamente. */
  failed: number;
  /** Ainda não processados. */
  remaining: number;
  /** Processados nesta chamada. */
  processedNow: number;
  /** Não há mais nada a fazer. */
  done: boolean;
};

/**
 * Garante que a tabela de controle exista antes de qualquer uso.
 *
 * POR QUE: a hospedagem publica o código novo mas NÃO roda as migrações do
 * banco. A migração `0005_backup_attachments` existe no repositório e é
 * validada pelo CI, mas nunca chegou ao banco de produção — o resultado foi
 * "Failed query: SELECT source_url FROM backup_attachments" na primeira vez
 * que o botão foi usado.
 *
 * Este CREATE TABLE IF NOT EXISTS é idempotente e reproduz exatamente o DDL da
 * migração, então convergem para o mesmo resultado: quem já tem a tabela não é
 * afetado, quem não tem passa a ter. Ele existe para que a funcionalidade não
 * dependa de alguém lembrar de aplicar a migração à mão.
 */
async function ensureTable(db: any): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS \`backup_attachments\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`source_url\` varchar(500) NOT NULL,
      \`category\` varchar(50) NOT NULL,
      \`file_name\` varchar(255) NOT NULL,
      \`storage_url\` text,
      \`size_bytes\` int,
      \`status\` enum('archived','failed') NOT NULL,
      \`error_message\` text,
      \`archived_at\` timestamp NOT NULL DEFAULT (now()),
      CONSTRAINT \`backup_attachments_id\` PRIMARY KEY(\`id\`),
      CONSTRAINT \`backup_attachments_source_url_unique\` UNIQUE(\`source_url\`)
    )
  `);
}

/** URLs já processadas (arquivadas ou com falha registrada). */
async function loadProcessedUrls(db: any): Promise<Set<string>> {
  const raw = (await db.execute(
    sql`SELECT source_url FROM backup_attachments`,
  )) as any;
  const rows = Array.isArray(raw[0]) ? raw[0] : raw;
  const set = new Set<string>();
  for (const r of Array.isArray(rows) ? rows : []) {
    if (r?.source_url) set.add(String(r.source_url));
  }
  return set;
}

async function recordResult(
  db: any,
  item: Attachment,
  result:
    | { status: "archived"; storageUrl: string; sizeBytes: number }
    | { status: "failed"; error: string },
): Promise<void> {
  // INSERT IGNORE: a URL é única. Se duas execuções concorrerem, a segunda
  // apenas não grava — nunca derruba o processo.
  if (result.status === "archived") {
    await db.execute(sql`
      INSERT IGNORE INTO backup_attachments
        (source_url, category, file_name, storage_url, size_bytes, status)
      VALUES (${item.url}, ${item.category}, ${item.name}, ${result.storageUrl}, ${result.sizeBytes}, 'archived')
    `);
  } else {
    await db.execute(sql`
      INSERT IGNORE INTO backup_attachments
        (source_url, category, file_name, status, error_message)
      VALUES (${item.url}, ${item.category}, ${item.name}, 'failed', ${result.error.slice(0, 500)})
    `);
  }
}

/** Baixa, criptografa e envia um anexo para o storage de backup. */
async function archiveOne(item: Attachment, key: Buffer): Promise<{ storageUrl: string; sizeBytes: number }> {
  assertSafeExternalUrl(item.url);

  const response = await axios.get(item.url, {
    responseType: "arraybuffer",
    timeout: DOWNLOAD_TIMEOUT_MS,
    maxContentLength: MAX_FILE_BYTES,
    maxBodyLength: MAX_FILE_BYTES,
  });

  const plain = Buffer.from(response.data);
  const encrypted = encryptBackupBuffer(plain, key);
  const storageKey = `backups/anexos/${item.category}/${item.name}.enc`;
  const { url } = await storagePut(storageKey, encrypted, "application/octet-stream");

  return { storageUrl: url, sizeBytes: encrypted.length };
}

/**
 * Processa anexos ainda não arquivados até esgotar o orçamento de tempo.
 *
 * Retorna o progresso para a tela decidir se chama de novo. Cada chamada cabe
 * no ciclo de vida de uma requisição por construção — é o relógio que fecha o
 * lote, não uma contagem de arquivos chutada.
 */
export async function archiveAttachmentsBatch(
  db: any,
  batchSize = 25,
  budgetMs = BUDGET_MS,
): Promise<ArchiveProgress> {
  const startedAt = Date.now();
  const key = getBackupEncryptionKey();
  await ensureTable(db);

  const all = await collectAttachments(db);
  const processed = await loadProcessedUrls(db);
  const pending = all.filter((a) => !processed.has(a.url));

  let processedNow = 0;
  for (const item of pending) {
    // `batchSize` vira só uma trava superior; quem manda é o relógio. O teste
    // de tempo vem DEPOIS do primeiro arquivo para garantir que toda chamada
    // avance pelo menos um item — senão um orçamento apertado devolveria
    // sempre zero e o laço do frontend nunca terminaria.
    if (processedNow >= batchSize) break;
    if (processedNow > 0 && Date.now() - startedAt >= budgetMs) break;

    try {
      const result = await archiveOne(item, key);
      await recordResult(db, item, { status: "archived", ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[backupAnexos] Falha em ${item.url}:`, message);
      // Registra a falha para não travar o lote repetindo o mesmo arquivo
      // indefinidamente. Fica visível no relatório para tratamento manual.
      await recordResult(db, item, { status: "failed", error: message });
    }
    processedNow++;
  }

  const statusRaw = (await db.execute(sql`
    SELECT status, COUNT(*) AS total FROM backup_attachments GROUP BY status
  `)) as any;
  const statusRows = Array.isArray(statusRaw[0]) ? statusRaw[0] : statusRaw;
  let archived = 0;
  let failed = 0;
  for (const r of Array.isArray(statusRows) ? statusRows : []) {
    if (r?.status === "archived") archived = Number(r.total ?? 0);
    if (r?.status === "failed") failed = Number(r.total ?? 0);
  }

  const remaining = Math.max(0, pending.length - processedNow);

  return {
    total: all.length,
    archived,
    failed,
    remaining,
    processedNow,
    done: remaining === 0,
  };
}

/** Situação atual, sem processar nada — para a tela exibir ao abrir. */
export async function getArchiveProgress(db: any): Promise<ArchiveProgress> {
  await ensureTable(db);
  const all = await collectAttachments(db);
  const processed = await loadProcessedUrls(db);

  const statusRaw = (await db.execute(sql`
    SELECT status, COUNT(*) AS total FROM backup_attachments GROUP BY status
  `)) as any;
  const statusRows = Array.isArray(statusRaw[0]) ? statusRaw[0] : statusRaw;
  let archived = 0;
  let failed = 0;
  for (const r of Array.isArray(statusRows) ? statusRows : []) {
    if (r?.status === "archived") archived = Number(r.total ?? 0);
    if (r?.status === "failed") failed = Number(r.total ?? 0);
  }

  const remaining = all.filter((a) => !processed.has(a.url)).length;
  return { total: all.length, archived, failed, remaining, processedNow: 0, done: remaining === 0 };
}
