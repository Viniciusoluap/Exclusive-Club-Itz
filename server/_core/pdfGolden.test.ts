/**
 * Nenhum PDF pode mudar uma letra sequer.
 *
 * EXIGÊNCIA DO RESPONSÁVEL PELO PROJETO, literal: os documentos precisam
 * continuar exatamente como são hoje — mesmo texto, mesma pontuação, mesmo
 * layout, mesmos lugares. O cliente não pode perceber diferença nenhuma. O que
 * muda é só a organização interna do código.
 *
 * COMO ESTA TRAVA FUNCIONA: cada documento é gerado a partir de uma amostra
 * fixa e comparado, byte a byte, com uma referência guardada em
 * `__pdf-referencia__/`. Só a data de criação e o identificador do arquivo são
 * neutralizados, porque mudam a cada geração sem que nada no documento mude.
 *
 * SE UM TESTE DAQUI FALHAR: o documento mudou. Não "provavelmente mudou" —
 * mudou. A mensagem aponta o primeiro byte divergente com o texto em volta.
 *
 * PARA ATUALIZAR UMA REFERÊNCIA DE PROPÓSITO (quando a mudança for desejada e
 * aprovada): rode com `ATUALIZAR_PDF_REFERENCIA=1`. Fora isso, a referência é
 * imutável — é ela que sustenta a promessa feita ao responsável.
 */

/**
 * FUSO FIXO, ANTES DE QUALQUER OUTRA COISA.
 *
 * `fuelRecordPDF.ts:247` formata a data com `toLocaleDateString('pt-BR')` sem
 * dizer o fuso, então a data impressa depende do fuso da máquina. Numa máquina
 * em UTC-3 um registro da madrugada sai com o dia anterior; em UTC, com o dia
 * seguinte.
 *
 * Isso é defeito de verdade e está reportado ao responsável — corrigi-lo muda o
 * documento, e mudar o documento é exatamente o que ele proibiu sem aprovação.
 * Enquanto a decisão não vem, a trava fixa o fuso para não acusar diferença que
 * é da máquina, não do código.
 */
process.env.TZ = "UTC";

import { describe, expect, it, beforeAll, afterAll, vi } from "vitest";
import fs from "fs";
import path from "path";
import { normalizarPdf, ondeDiferem } from "./pdfGolden";
import {
  CLIENTE_EXEMPLO,
  ABASTECIMENTOS_EXEMPLO,
  VISTORIAS_EXEMPLO,
  NOTIFICACAO_EXEMPLO,
  CONTRATO_EXEMPLO,
} from "./pdfFixtures";

const PASTA = path.join(__dirname, "__pdf-referencia__");
const ATUALIZAR = process.env.ATUALIZAR_PDF_REFERENCIA === "1";

beforeAll(() => {
  // A data entra em alguns documentos ("Gerado em…"). Sem congelar, a
  // referência mudaria sozinha todo dia e a trava viraria ruído.
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-20T15:00:00.000Z"));
  fs.mkdirSync(PASTA, { recursive: true });
});

afterAll(() => {
  vi.useRealTimers();
});

/** Gera, normaliza e confronta com a referência guardada. */
async function conferirDocumento(nome: string, gerar: () => Promise<Buffer>) {
  const atual = normalizarPdf(await gerar());
  const arquivo = path.join(PASTA, `${nome}.pdf`);

  if (ATUALIZAR || !fs.existsSync(arquivo)) {
    fs.writeFileSync(arquivo, atual);
    // Criar a referência não é o mesmo que conferir. Sem isto, a primeira
    // execução aprovaria qualquer coisa e ninguém perceberia.
    if (!ATUALIZAR) {
      throw new Error(
        `Referência de "${nome}" não existia e foi criada agora. ` +
          `Confira o PDF em ${arquivo}, comprove que está correto, comite o arquivo ` +
          `e rode de novo — só então a trava passa a valer.`,
      );
    }
    return;
  }

  const esperado = fs.readFileSync(arquivo);
  if (!esperado.equals(atual)) {
    const saida = path.join("/tmp", `pdf-divergente-${nome}.pdf`);
    fs.writeFileSync(saida, atual);
    throw new Error(
      `O documento "${nome}" MUDOU.\n\n${ondeDiferem(esperado, atual)}\n\n` +
        `O gerado agora está em ${saida}, para comparar com ${arquivo}.\n` +
        `Se a mudança for intencional e aprovada, rode com ATUALIZAR_PDF_REFERENCIA=1.`,
    );
  }

  expect(esperado.equals(atual)).toBe(true);
}

describe("documentos que vão para o cliente não podem mudar", () => {
  it("Relatório do cliente", async () => {
    const { generateClientReport } = await import("./clientReportPDF");
    await conferirDocumento("relatorio-cliente", () =>
      generateClientReport(CLIENTE_EXEMPLO as never),
    );
  }, 60000);

  it("Relatório de abastecimento", async () => {
    const { generateFuelRecordsPDF } = await import("./fuelRecordPDF");
    await conferirDocumento("relatorio-abastecimento", () =>
      generateFuelRecordsPDF(ABASTECIMENTOS_EXEMPLO as never),
    );
  }, 60000);

  it("Relatório de vistorias", async () => {
    const { generateInspectionsReportPDF } = await import("./inspectionsPDF");
    await conferirDocumento("relatorio-vistorias", () =>
      generateInspectionsReportPDF(VISTORIAS_EXEMPLO as never),
    );
  }, 60000);

  it("Notificação extrajudicial", async () => {
    const { generateNotificationPdf } = await import("./htmlToPdf");
    await conferirDocumento("notificacao", () =>
      generateNotificationPdf(NOTIFICACAO_EXEMPLO as never),
    );
  }, 60000);

  it("Contrato", async () => {
    const { generateContractPdf } = await import("./htmlToPdf");
    await conferirDocumento("contrato", () => generateContractPdf(CONTRATO_EXEMPLO as never));
  }, 60000);
});

describe("a própria trava", () => {
  it("roda com fuso fixo — senão acusa diferença que é da máquina", () => {
    // Sem isto, a mesma versão do código gera documentos diferentes em
    // máquinas diferentes, e a trava vira loteria.
    expect(new Date("2026-03-20T02:00:00.000Z").toLocaleDateString("pt-BR")).toBe("20/03/2026");
  });

  it("neutraliza data de criação e identificador, e só isso", () => {
    // Se a normalização apagasse conteúdo demais, a trava passaria a aprovar
    // documentos diferentes — pior que não existir.
    const pdf = Buffer.from(
      "%PDF-1.3\n/Producer (jsPDF)\n/CreationDate (D:20260814125613-00'00')\n" +
        "(Relatório de Vistorias) Tj\n/ID [ <ABC123> <ABC123> ]\n",
      "latin1",
    );

    const texto = normalizarPdf(pdf).toString("latin1");

    expect(texto).toContain("(Relatório de Vistorias) Tj");
    expect(texto).toContain("/Producer (jsPDF)");
    expect(texto).toContain("/CreationDate (FIXA)");
    expect(texto).not.toContain("20260814125613");
    expect(texto).not.toContain("ABC123");
  });

  it("dois PDFs iguais a menos da data ficam idênticos após normalizar", () => {
    const molde = (data: string, id: string) =>
      Buffer.from(
        `%PDF-1.3\n/CreationDate (D:${data})\n(Texto) Tj\n/ID [ <${id}> <${id}> ]\n`,
        "latin1",
      );

    const a = normalizarPdf(molde("20260101000000-00'00'", "AAAA"));
    const b = normalizarPdf(molde("20260814125613-00'00'", "BBBB"));

    expect(a.equals(b)).toBe(true);
  });

  it("um caractere trocado NÃO passa despercebido", () => {
    // O teste do teste: se isto falhar, a trava não trava.
    const a = normalizarPdf(Buffer.from("(Relatório) Tj", "latin1"));
    const b = normalizarPdf(Buffer.from("(Relatorio) Tj", "latin1"));

    expect(a.equals(b)).toBe(false);
    expect(ondeDiferem(a, b)).toContain("Divergência no byte");
  });

  it("aponta onde a divergência começa", () => {
    const a = Buffer.from("mesma coisa AQUI diferente", "latin1");
    const b = Buffer.from("mesma coisa ALI diferente", "latin1");

    const msg = ondeDiferem(a, b);

    expect(msg).toContain("esperado:");
    expect(msg).toContain("obtido:");
  });
});
