/**
 * Base comum dos documentos gerados com PDFKit (Story 30).
 *
 * O PROBLEMA QUE ISTO RESOLVE: cada documento tinha a sua própria cópia da
 * paleta de cores, do caminho do logo e do jeito de baixar uma imagem externa.
 * Uma correção de qualquer um desses pontos precisava ser feita em três lugares
 * — e bastava esquecer um para os documentos começarem a divergir.
 *
 * O QUE ISTO NÃO É: uma padronização visual. A exigência do responsável pelo
 * projeto é que os documentos continuem EXATAMENTE como são hoje, até a
 * pontuação. Então aqui só entra o que já era idêntico entre eles. Onde os
 * documentos diferem — e eles diferem, o cabeçalho é 24pt num e 18pt no outro —
 * a diferença fica no documento, não é "corrigida".
 *
 * A trava em `pdfGolden.test.ts` compara cada documento byte a byte com uma
 * referência gerada ANTES desta reorganização. Se algo aqui mudar o resultado,
 * o CI barra.
 */

import fs from "fs";
import path from "path";
import axios from "axios";
import { assertSafeExternalUrl } from "./urlSafety";

/**
 * A paleta, com os mesmos valores que já estavam espalhados pelos arquivos.
 *
 * Os nomes descrevem o uso, não o tom: quem lê `CORES.marca` entende a
 * intenção; quem lê `#0891b2` precisa adivinhar. Os valores são idênticos aos
 * anteriores — trocar um deles muda os documentos e o CI recusa.
 */
export const CORES = {
  /** Azul-turquesa da Exclusive Club — títulos dos RELATÓRIOS. */
  marca: "#0891b2",
  /**
   * Azul-marinho dos DOCUMENTOS JURÍDICOS (contrato e notificação).
   *
   * É outro azul, de propósito. Ao montar esta paleta eu assumi que existia um
   * azul só e troquei este pelo da marca — a trava barrou, mostrando que todo
   * contrato e toda notificação mudariam de cor. A suposição custaria caro
   * porque esses documentos vão assinados para o cliente.
   */
  marinho: "#0a3d6b",
  preto: "#000000",
  branco: "#ffffff",
  /** Texto secundário claro. */
  cinzaClaro: "#666666",
  /** Texto secundário do contrato/notificação. */
  cinza: "#6b7280",
  /** Texto principal quase preto. */
  tinta: "#1a1a1a",
  /** Título escuro dos relatórios. */
  tintaEscura: "#1f2937",
  /** Linhas e divisórias. */
  linha: "#e5e7eb",
  /** Rótulos de tabela. */
  rotulo: "#374151",
} as const;

/**
 * Caminho do logo no disco, ou `null` se não estiver lá.
 *
 * Devolver `null` em vez de estourar é proposital: um documento sem logo é
 * incompleto, mas um documento que não é gerado é pior. O comportamento é o
 * mesmo de antes — o chamador já testava a existência do arquivo.
 */
export function caminhoDoLogo(): string | null {
  const caminho = path.join(process.cwd(), "client/public/logo-exclusive-round.png");
  return fs.existsSync(caminho) ? caminho : null;
}

export type ImagemBaixada = {
  bytes: Buffer;
  /**
   * `content-type` da resposta COMO VEIO, sem normalizar; vazio se ausente.
   *
   * Não normalizar é deliberado. O chamador testa `contentType.includes("image")`,
   * e passar para minúsculas faria um servidor que responde `IMAGE/PNG` passar a
   * ser aceito — comportamento diferente do de hoje. Numa reorganização que
   * promete não mudar nada, "melhorar" de passagem é quebrar a promessa.
   */
  contentType: string;
};

/**
 * Baixa uma imagem de fora, passando pela verificação de segurança.
 *
 * `assertSafeExternalUrl` continua sendo a primeira linha: ele existe porque
 * uma auditoria anterior encontrou SSRF nesta exata rota — uma URL vinda do
 * banco era buscada sem conferência. A verificação vem antes da requisição, e
 * segue estourando para o chamador tratar, como antes.
 */
export async function baixarImagemExterna(
  url: string,
  timeoutMs = 10000,
): Promise<ImagemBaixada> {
  assertSafeExternalUrl(url);

  const resposta = await axios.get(url, { responseType: "arraybuffer", timeout: timeoutMs });

  return {
    bytes: Buffer.from(resposta.data),
    contentType: String(resposta.headers["content-type"] || ""),
  };
}
