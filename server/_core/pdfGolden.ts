/**
 * Trava de regressão visual dos PDFs (Story 30).
 *
 * O QUE ESTA TRAVA GARANTE: que a reorganização interna do código de PDF não
 * mudou **uma única letra, pontuação ou posição** no documento que chega ao
 * cliente. Foi essa a exigência do responsável pelo projeto: por dentro pode
 * mudar tudo; por fora, nada.
 *
 * COMO ELA GARANTE: comparando os bytes do PDF, não a aparência dele.
 *
 * Dois PDFs com os mesmos bytes são o mesmo documento — não há margem para
 * "quase igual". Comparar imagem renderizada seria mais frágil (o desenho
 * depende da versão do rasterizador e do sistema operacional) e mais fraco
 * (diferença de um pixel pode ser antialiasing, ou pode ser texto trocado, e
 * o teste não sabe distinguir).
 *
 * O ÚNICO CUIDADO: dois bytes do arquivo mudam a cada geração sem que nada no
 * documento mude — a data de criação e o identificador do arquivo. Foi
 * verificado, gerando o mesmo PDF duas vezes: o tamanho é idêntico e as únicas
 * diferenças estão nesses dois campos. Eles são neutralizados aqui.
 */

/** Campos que mudam a cada geração sem alterar o documento. */
const VOLATEIS: Array<[RegExp, string]> = [
  // jsPDF e PDFKit: /CreationDate (D:20260814125613-00'00')
  [/\/CreationDate\s*\([^)]*\)/g, "/CreationDate (FIXA)"],
  [/\/ModDate\s*\([^)]*\)/g, "/ModDate (FIXA)"],
  // Identificador do arquivo: /ID [ <4D3D...> <4D3D...> ]
  [/\/ID\s*\[\s*<[^>]*>\s*<[^>]*>\s*\]/g, "/ID [ <FIXO> <FIXO> ]"],
];

/**
 * Zera o que varia por geração, preservando todo o resto byte a byte.
 *
 * `latin1` porque um PDF é binário: essa é a única codificação que faz o
 * caminho buffer → texto → buffer sem perder nem alterar nenhum byte.
 */
export function normalizarPdf(pdf: Buffer): Buffer {
  let texto = pdf.toString("latin1");
  for (const [padrao, fixo] of VOLATEIS) texto = texto.replace(padrao, fixo);
  return Buffer.from(texto, "latin1");
}

/**
 * Trecho legível de onde dois PDFs divergem.
 *
 * "Os bytes diferem" não ajuda ninguém a entender o que quebrou. Isto mostra o
 * primeiro ponto de divergência com o contexto em volta — no jsPDF, que não
 * comprime o conteúdo, o texto do documento aparece direto ali.
 */
export function ondeDiferem(esperado: Buffer, obtido: Buffer): string {
  const a = esperado.toString("latin1");
  const b = obtido.toString("latin1");

  if (a === b) return "";

  const limite = Math.min(a.length, b.length);
  let i = 0;
  while (i < limite && a[i] === b[i]) i++;

  const janela = (s: string) =>
    s.slice(Math.max(0, i - 80), i + 80).replace(/[^\x20-\x7e]/g, "·");

  return [
    `Divergência no byte ${i} (esperado ${esperado.length} bytes, obtido ${obtido.length}).`,
    `esperado: …${janela(a)}…`,
    `obtido:   …${janela(b)}…`,
  ].join("\n");
}
