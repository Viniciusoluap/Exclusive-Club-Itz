/**
 * Recolocação dos anexos recuperados DE VOLTA nos registros do sistema.
 *
 * POR QUE EXISTE: arquivar (`backupAttachmentsArchive.ts`) e baixar um arquivo
 * avulso resolvem "tenho o arquivo em mãos". Não resolvem o problema real: a
 * ficha do cliente continua dizendo "Erro ao carregar documento pessoal",
 * porque `allowed_clients.document_url` segue apontando para uma URL que
 * morreu. Enquanto a coluna não apontar para um arquivo que responde, o
 * sistema continua quebrado mesmo com a cópia salva.
 *
 * O QUE FAZ: para cada anexo arquivado cuja URL original não responde mais,
 * descriptografa a cópia guardada, sobe de novo para o storage vivo (o mesmo
 * caminho que /api/upload-receipt usa) e reescreve a coluna que a referenciava
 * para a URL nova.
 *
 * O QUE NUNCA FAZ:
 *   - não toca em anexo cuja URL original ainda responde (o que funciona fica
 *     como está);
 *   - não altera nenhuma linha por aproximação: o UPDATE casa a URL exata;
 *   - não apaga nada — a cópia criptografada continua no lugar.
 *
 * ORÇAMENTO DE TEMPO: mesma razão de `archiveAttachmentsBatch` — nesta
 * hospedagem a requisição morre antes de centenas de arquivos terminarem. Cada
 * chamada trabalha até estourar o relógio e devolve o progresso; a tela chama
 * de novo até acabar.
 */

import axios from "axios";
import { sql } from "drizzle-orm";
import { assertSafeExternalUrl } from "./_core/urlSafety";
import { getBackupEncryptionKey, decryptBackupBuffer, isEncryptedBackup } from "./backup";
import { storagePut, storageGet } from "./storage";

const BUDGET_MS = 12000;
const LIVENESS_TIMEOUT_MS = 6000;
const DOWNLOAD_TIMEOUT_MS = 15000;

/**
 * Onde cada tipo de anexo mora. Espelha `collectAttachments` — é a mesma lista
 * de colunas, vista do outro lado: lá para encontrar URLs, aqui para reescrevê-las.
 *
 * `inspections.reprovation_photos` fica de fora desta lista porque guarda um
 * JSON com várias fotos, não uma URL por coluna — é tratado à parte.
 */
const COLUNAS_DE_ANEXO: Array<{ tabela: string; colunas: string[] }> = [
  { tabela: "allowed_clients", colunas: ["document_url", "contract_url", "contract2_url"] },
  { tabela: "fuel_records", colunas: ["photo_before_url", "photo_after_url", "receipt_url"] },
  { tabela: "fuel_record_containers", colunas: ["photo_before_url", "photo_after_url"] },
  { tabela: "inspection_charges", colunas: ["receipt_url"] },
  { tabela: "bpo_charges", colunas: ["receipt_url"] },
  { tabela: "vessels", colunas: ["image_url", "document_url", "extra_document_url"] },
];

export type ReattachProgress = {
  /** Anexos arquivados com sucesso, candidatos a serem recolocados. */
  total: number;
  /** Processados nesta chamada. */
  processedNow: number;
  /** Recolocados nesta chamada (URL nova gravada no registro). */
  reattachedNow: number;
  /** Ainda tinham URL original funcionando — nada a fazer. */
  stillWorkingNow: number;
  /** Já não são referenciados por nenhum registro (recolocados antes, ou registro removido). */
  notReferencedNow: number;
  /** Falharam nesta chamada, com o motivo. */
  failures: Array<{ arquivo: string; motivo: string }>;
  /** Não há mais nada a processar. */
  done: boolean;
  /** Quantos ainda faltam depois desta chamada. */
  remaining: number;
  /**
   * A URL que o storage devolve ao subir um arquivo carrega parâmetros de
   * expiração?
   *
   * POR QUE IMPORTA: se carrega, guardar essa URL no banco como referência
   * permanente é o que faz os anexos virarem "AccessDenied" com o tempo — e
   * recolocar seria um paliativo que precisa ser repetido, não a solução. Se
   * não carrega, o link é estável e recolocar resolve de vez. Esta resposta
   * decide o próximo passo do plano, então o sistema a coleta sozinho em vez
   * de depender de alguém inspecionar uma URL a olho nu.
   *
   * `undefined` quando nenhum arquivo foi enviado nesta chamada.
   */
  storageUrlComExpiracao?: boolean;
};

/** Marcadores usuais de URL assinada com prazo (S3/CloudFront). */
function urlTemExpiracao(url: string): boolean {
  return /[?&](Expires|Signature|X-Amz-Expires|X-Amz-Signature|X-Amz-Date|X-Amz-Credential)=/i.test(url);
}

type LinhaArquivada = { id: number; category: string; file_name: string; source_url: string; storage_url: string | null };

async function consultar(db: any, statement: any): Promise<any[]> {
  const raw = (await db.execute(statement)) as any;
  const rows = Array.isArray(raw[0]) ? raw[0] : raw;
  return Array.isArray(rows) ? rows : [];
}

/** Anexos arquivados com sucesso, na ordem do índice. */
async function listarArquivados(db: any): Promise<LinhaArquivada[]> {
  const rows = await consultar(
    db,
    sql`SELECT id, category, file_name, source_url, storage_url
        FROM backup_attachments
        WHERE status = 'archived'
        ORDER BY id`,
  );
  return rows.map((r: any) => ({
    id: Number(r.id),
    category: String(r.category ?? ""),
    file_name: String(r.file_name ?? ""),
    source_url: String(r.source_url ?? ""),
    storage_url: r.storage_url ? String(r.storage_url) : null,
  }));
}

/**
 * Quantos registros ainda apontam para esta URL.
 *
 * É também o marcador de progresso: depois de recolocado, o registro passa a
 * apontar para a URL nova, então este número vira zero e o anexo não é
 * reprocessado numa próxima rodada. Não precisa de tabela de controle nova.
 */
async function contarReferencias(db: any, url: string): Promise<number> {
  let total = 0;

  for (const { tabela, colunas } of COLUNAS_DE_ANEXO) {
    const condicoes = colunas.map(c => `\`${c}\` = ?`).join(" OR ");
    try {
      const rows = await consultar(
        db,
        sql.raw(
          `SELECT COUNT(*) AS total FROM \`${tabela}\` WHERE ${condicoes.replace(/\?/g, quoteSql(url))}`,
        ),
      );
      total += Number(rows[0]?.total ?? 0);
    } catch {
      // Tabela/coluna que não existe neste ambiente não invalida as demais.
    }
  }

  try {
    const rows = await consultar(
      db,
      sql.raw(
        `SELECT COUNT(*) AS total FROM \`inspections\` WHERE \`reprovation_photos\` LIKE ${quoteSql(`%${url}%`)}`,
      ),
    );
    total += Number(rows[0]?.total ?? 0);
  } catch {
    /* idem */
  }

  return total;
}

function quoteSql(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
}

/** A URL original ainda responde? Se sim, não há o que recolocar. */
async function urlAindaResponde(url: string): Promise<boolean> {
  try {
    assertSafeExternalUrl(url);
    await axios.get(url, {
      responseType: "arraybuffer",
      timeout: LIVENESS_TIMEOUT_MS,
      // Só o começo do arquivo: confirmar que responde não exige baixar tudo.
      headers: { Range: "bytes=0-1023" },
      maxContentLength: 5 * 1024 * 1024,
    });
    return true;
  } catch {
    return false;
  }
}

/** Bytes originais (já descriptografados) da cópia arquivada. */
async function obterConteudoArquivado(linha: LinhaArquivada): Promise<Buffer> {
  const falhas: string[] = [];

  if (linha.storage_url) {
    try {
      assertSafeExternalUrl(linha.storage_url);
      const resposta = await axios.get(linha.storage_url, { responseType: "arraybuffer", timeout: DOWNLOAD_TIMEOUT_MS });
      return desembrulhar(Buffer.from(resposta.data));
    } catch (error: any) {
      falhas.push(`URL do índice: ${error?.message ?? error}`);
    }
  }

  const chave = `backups/anexos/${linha.category}/${linha.file_name}.enc`;
  try {
    const { url } = await storageGet(chave);
    const resposta = await axios.get(url, { responseType: "arraybuffer", timeout: DOWNLOAD_TIMEOUT_MS });
    return desembrulhar(Buffer.from(resposta.data));
  } catch (error: any) {
    falhas.push(`chave "${chave}": ${error?.message ?? error}`);
  }

  throw new Error(`não foi possível ler a cópia arquivada (${falhas.join(" | ")})`);
}

function desembrulhar(bruto: Buffer): Buffer {
  return isEncryptedBackup(bruto) ? decryptBackupBuffer(bruto, getBackupEncryptionKey()) : bruto;
}

function tipoPorExtensao(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "pdf":
      return "application/pdf";
    default:
      return "application/octet-stream";
  }
}

/** Reescreve a URL antiga pela nova em todo lugar que a referenciava. */
async function reapontarRegistros(db: any, urlAntiga: string, urlNova: string): Promise<number> {
  let alteradas = 0;

  for (const { tabela, colunas } of COLUNAS_DE_ANEXO) {
    for (const coluna of colunas) {
      try {
        await db.execute(
          sql.raw(
            `UPDATE \`${tabela}\` SET \`${coluna}\` = ${quoteSql(urlNova)} WHERE \`${coluna}\` = ${quoteSql(urlAntiga)}`,
          ),
        );
        const rows = await consultar(
          db,
          sql.raw(`SELECT COUNT(*) AS total FROM \`${tabela}\` WHERE \`${coluna}\` = ${quoteSql(urlNova)}`),
        );
        alteradas += Number(rows[0]?.total ?? 0);
      } catch {
        // Coluna inexistente neste ambiente não impede as demais.
      }
    }
  }

  // Vistorias guardam várias fotos num JSON de texto: troca pontual da URL
  // dentro do texto, sem reescrever o restante da estrutura.
  try {
    await db.execute(
      sql.raw(
        `UPDATE \`inspections\`
         SET \`reprovation_photos\` = REPLACE(\`reprovation_photos\`, ${quoteSql(urlAntiga)}, ${quoteSql(urlNova)})
         WHERE \`reprovation_photos\` LIKE ${quoteSql(`%${urlAntiga}%`)}`,
      ),
    );
  } catch {
    /* idem */
  }

  return alteradas;
}

/**
 * Processa anexos até esgotar o orçamento de tempo.
 *
 * Ordem por anexo: ainda é referenciado? → a URL original responde? → só então
 * recoloca. Cada pergunta barata vem antes da cara, para o lote render o
 * máximo dentro da janela da requisição.
 */
export async function reattachAttachmentsBatch(
  db: any,
  budgetMs = BUDGET_MS,
): Promise<ReattachProgress> {
  const iniciouEm = Date.now();
  const arquivados = await listarArquivados(db);

  let processedNow = 0;
  let reattachedNow = 0;
  let stillWorkingNow = 0;
  let notReferencedNow = 0;
  const failures: ReattachProgress["failures"] = [];
  let pendentes = 0;
  let storageUrlComExpiracao: boolean | undefined;

  for (const linha of arquivados) {
    // O teste de tempo vem depois do primeiro item para toda chamada avançar
    // pelo menos um anexo — senão um orçamento apertado devolveria sempre zero
    // e o laço da tela nunca terminaria.
    if (processedNow > 0 && Date.now() - iniciouEm >= budgetMs) {
      pendentes++;
      continue;
    }

    try {
      const referencias = await contarReferencias(db, linha.source_url);
      if (referencias === 0) {
        notReferencedNow++;
        processedNow++;
        continue;
      }

      if (await urlAindaResponde(linha.source_url)) {
        stillWorkingNow++;
        processedNow++;
        continue;
      }

      const conteudo = await obterConteudoArquivado(linha);
      const chaveNova = `recuperados/${linha.category}/${Date.now()}-${linha.file_name}`;
      const { url: urlNova } = await storagePut(chaveNova, conteudo, tipoPorExtensao(linha.file_name));
      if (storageUrlComExpiracao === undefined) storageUrlComExpiracao = urlTemExpiracao(urlNova);

      await reapontarRegistros(db, linha.source_url, urlNova);
      reattachedNow++;
      processedNow++;
    } catch (error: any) {
      failures.push({ arquivo: linha.file_name, motivo: error?.message ?? String(error) });
      processedNow++;
    }
  }

  return {
    total: arquivados.length,
    processedNow,
    reattachedNow,
    stillWorkingNow,
    notReferencedNow,
    failures,
    remaining: pendentes,
    done: pendentes === 0,
    storageUrlComExpiracao,
  };
}
