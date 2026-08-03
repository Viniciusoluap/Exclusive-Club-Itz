/**
 * Coleta e download dos ARQUIVOS ANEXADOS para dentro do backup.
 *
 * O dump do banco guarda apenas as URLs dos anexos — as imagens e PDFs em si
 * vivem no storage externo (proxy Forge/S3). Se aquele storage se perder, o
 * backup do banco sozinho não recupera nenhuma foto nem documento: sobram
 * apenas links quebrados. Este módulo baixa os arquivos e os empacota junto.
 *
 * SEGURANÇA: as URLs vêm do banco, ou seja, são dado potencialmente controlável
 * por quem consegue gravar nessas colunas. Toda URL passa por
 * assertSafeExternalUrl antes do download, para que o servidor não seja usado
 * como ponte para endereços internos (mesma proteção aplicada na geração de PDF).
 *
 * ROBUSTEZ: uma falha em um arquivo não derruba o backup inteiro. O que não foi
 * possível baixar é registrado em MANIFESTO.txt dentro do próprio zip, de modo
 * que o backup nunca minta sobre o que realmente contém.
 */

import axios from "axios";
import { sql } from "drizzle-orm";
import { assertSafeExternalUrl } from "./_core/urlSafety";

export type Attachment = {
  url: string;
  /** Subpasta dentro de uploads/ no zip. */
  category: string;
  /** Nome sugerido, já sem caracteres problemáticos. */
  name: string;
};

export type DownloadedAttachment = Attachment & { buffer: Buffer };

export type AttachmentReport = {
  total: number;
  downloaded: number;
  failed: Array<{ url: string; category: string; reason: string }>;
  totalBytes: number;
};

/** Limite por arquivo — evita que um único item estoure a memória do processo. */
const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB
/** Teto do conjunto de anexos, para o backup não crescer sem controle. */
const MAX_TOTAL_BYTES = 500 * 1024 * 1024; // 500 MB
const DOWNLOAD_TIMEOUT_MS = 20000;
const CONCURRENCY = 4;

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

/** Deriva um nome de arquivo a partir da URL, com prefixo identificador. */
function fileNameFrom(url: string, prefix: string): string {
  let base = "arquivo";
  try {
    const path = new URL(url).pathname;
    const last = path.split("/").filter(Boolean).pop();
    if (last) base = last;
  } catch {
    /* URL inválida — o guard de segurança rejeita depois */
  }
  return sanitize(`${prefix}-${base}`);
}

function addUrl(list: Attachment[], seen: Set<string>, url: unknown, category: string, prefix: string) {
  if (typeof url !== "string") return;
  const trimmed = url.trim();
  if (trimmed.length === 0 || seen.has(trimmed)) return;
  seen.add(trimmed);
  list.push({ url: trimmed, category, name: fileNameFrom(trimmed, prefix) });
}

/**
 * Varre o banco atrás de toda URL de anexo.
 *
 * Cobre: fotos de abastecimento (inclusive as por galão, em
 * fuel_record_containers), fotos de vistoria reprovada, documentos e contratos
 * de clientes, comprovantes de cobrança e documentos das embarcações.
 */
export async function collectAttachments(db: any): Promise<Attachment[]> {
  const list: Attachment[] = [];
  const seen = new Set<string>();

  const query = async (statement: any): Promise<any[]> => {
    try {
      const raw = (await db.execute(statement)) as any;
      const rows = Array.isArray(raw[0]) ? raw[0] : raw;
      return Array.isArray(rows) ? rows : [];
    } catch (e: any) {
      console.warn("[backupFiles] Consulta falhou:", e?.message);
      return [];
    }
  };

  // Clientes — documento pessoal e contratos
  for (const r of await query(sql`SELECT id, contract_url, contract2_url, document_url FROM allowed_clients`)) {
    addUrl(list, seen, r.document_url, "clientes", `cliente-${r.id}-documento`);
    addUrl(list, seen, r.contract_url, "clientes", `cliente-${r.id}-contrato`);
    addUrl(list, seen, r.contract2_url, "clientes", `cliente-${r.id}-contrato2`);
  }

  // Abastecimento — fotos antes/depois e comprovante
  for (const r of await query(sql`SELECT id, photo_before_url, photo_after_url, receipt_url FROM fuel_records`)) {
    addUrl(list, seen, r.photo_before_url, "abastecimento", `abastecimento-${r.id}-antes`);
    addUrl(list, seen, r.photo_after_url, "abastecimento", `abastecimento-${r.id}-depois`);
    addUrl(list, seen, r.receipt_url, "abastecimento", `abastecimento-${r.id}-comprovante`);
  }

  // Abastecimento por galão (registros com múltiplos containers)
  for (const r of await query(sql`SELECT id, photo_before_url, photo_after_url FROM fuel_record_containers`)) {
    addUrl(list, seen, r.photo_before_url, "abastecimento", `galao-${r.id}-antes`);
    addUrl(list, seen, r.photo_after_url, "abastecimento", `galao-${r.id}-depois`);
  }

  // Vistorias — fotos dos itens reprovados (JSON: [{itemName, photoUrl}])
  for (const r of await query(sql`SELECT id, reprovation_photos FROM inspections WHERE reprovation_photos IS NOT NULL`)) {
    let photos: any[] = [];
    try {
      photos = typeof r.reprovation_photos === "string" ? JSON.parse(r.reprovation_photos) : r.reprovation_photos;
    } catch {
      continue;
    }
    if (!Array.isArray(photos)) continue;
    photos.forEach((p, i) => {
      addUrl(list, seen, p?.photoUrl, "vistorias", `vistoria-${r.id}-${sanitize(String(p?.itemName ?? i))}`);
    });
  }

  // Comprovantes de cobrança
  for (const r of await query(sql`SELECT id, receipt_url FROM inspection_charges WHERE receipt_url IS NOT NULL`)) {
    addUrl(list, seen, r.receipt_url, "cobrancas", `cobranca-${r.id}-comprovante`);
  }
  for (const r of await query(sql`SELECT id, receipt_url FROM bpo_charges WHERE receipt_url IS NOT NULL`)) {
    addUrl(list, seen, r.receipt_url, "cobrancas", `bpo-${r.id}-comprovante`);
  }

  // Embarcações — imagem e documentos
  for (const r of await query(sql`SELECT id, image_url, document_url, extra_document_url FROM vessels`)) {
    addUrl(list, seen, r.image_url, "embarcacoes", `embarcacao-${r.id}-imagem`);
    addUrl(list, seen, r.document_url, "embarcacoes", `embarcacao-${r.id}-documento`);
    addUrl(list, seen, r.extra_document_url, "embarcacoes", `embarcacao-${r.id}-documento-extra`);
  }

  return list;
}

/** Baixa um anexo, respeitando o guard de SSRF e o limite de tamanho. */
async function downloadOne(item: Attachment): Promise<DownloadedAttachment> {
  assertSafeExternalUrl(item.url);
  const response = await axios.get(item.url, {
    responseType: "arraybuffer",
    timeout: DOWNLOAD_TIMEOUT_MS,
    maxContentLength: MAX_FILE_BYTES,
    maxBodyLength: MAX_FILE_BYTES,
  });
  return { ...item, buffer: Buffer.from(response.data) };
}

/**
 * Baixa todos os anexos, em lotes, tolerando falhas individuais.
 * Interrompe a coleta ao atingir MAX_TOTAL_BYTES, registrando o corte no relatório.
 */
export async function downloadAttachments(
  items: Attachment[],
): Promise<{ files: DownloadedAttachment[]; report: AttachmentReport }> {
  const files: DownloadedAttachment[] = [];
  const failed: AttachmentReport["failed"] = [];
  let totalBytes = 0;
  let stopped = false;

  for (let i = 0; i < items.length && !stopped; i += CONCURRENCY) {
    const batch = items.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map(downloadOne));

    results.forEach((result, idx) => {
      const item = batch[idx];
      if (result.status === "fulfilled") {
        if (totalBytes + result.value.buffer.length > MAX_TOTAL_BYTES) {
          stopped = true;
          failed.push({
            url: item.url,
            category: item.category,
            reason: `Limite total de anexos (${Math.round(MAX_TOTAL_BYTES / 1024 / 1024)} MB) atingido — arquivo não incluído.`,
          });
          return;
        }
        totalBytes += result.value.buffer.length;
        files.push(result.value);
      } else {
        const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
        failed.push({ url: item.url, category: item.category, reason });
      }
    });
  }

  // Itens que nem chegaram a ser tentados por causa do corte de tamanho.
  if (stopped) {
    const attempted = files.length + failed.length;
    for (const item of items.slice(attempted)) {
      failed.push({
        url: item.url,
        category: item.category,
        reason: "Não tentado — limite total de anexos já havia sido atingido.",
      });
    }
  }

  return {
    files,
    report: { total: items.length, downloaded: files.length, failed, totalBytes },
  };
}

/** Texto do MANIFESTO.txt incluído no zip, para o backup ser honesto sobre o que contém. */
export function buildManifest(report: AttachmentReport): string {
  const lines: string[] = [
    "MANIFESTO DE ANEXOS DO BACKUP",
    `Gerado em: ${new Date().toISOString()}`,
    "",
    `Anexos encontrados no banco: ${report.total}`,
    `Anexos incluídos no backup:  ${report.downloaded}`,
    `Tamanho total dos anexos:    ${(report.totalBytes / 1024 / 1024).toFixed(2)} MB`,
    `Anexos NÃO incluídos:        ${report.failed.length}`,
    "",
  ];

  if (report.failed.length > 0) {
    lines.push("--- ANEXOS QUE NÃO PUDERAM SER INCLUÍDOS ---");
    lines.push("(estes arquivos NÃO estão neste backup)");
    lines.push("");
    for (const f of report.failed) {
      lines.push(`[${f.category}] ${f.url}`);
      lines.push(`    motivo: ${f.reason}`);
    }
  } else {
    lines.push("Todos os anexos referenciados no banco foram incluídos.");
  }

  return lines.join("\n") + "\n";
}
