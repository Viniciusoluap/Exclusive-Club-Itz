/**
 * htmlToPdf.ts — Converte HTML para PDF usando weasyprint (sem Chrome/Puppeteer)
 *
 * weasyprint é uma ferramenta Python que converte HTML/CSS para PDF com
 * suporte completo a CSS, fontes e layout de página A4.
 *
 * Uso:
 *   const pdfBuffer = await htmlToPdf(htmlString);
 */
import { exec } from "child_process";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * Converte uma string HTML em um Buffer PDF usando weasyprint.
 * Não requer Chrome/Chromium instalado.
 *
 * @param html - String HTML completa (com <!DOCTYPE html> e estilos inline)
 * @returns Buffer com o conteúdo do PDF gerado
 */
export async function htmlToPdf(html: string): Promise<Buffer> {
  const tmpId = `ec-pdf-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const htmlPath = join(tmpdir(), `${tmpId}.html`);
  const pdfPath = join(tmpdir(), `${tmpId}.pdf`);

  try {
    // Escrever HTML em arquivo temporário
    await fs.writeFile(htmlPath, html, "utf-8");

    // Executar weasyprint para converter HTML → PDF
    await execAsync(`weasyprint "${htmlPath}" "${pdfPath}"`, {
      timeout: 30000, // 30 segundos de timeout
    });

    // Ler o PDF gerado
    const pdfBuffer = await fs.readFile(pdfPath);
    return pdfBuffer;
  } finally {
    // Limpar arquivos temporários (sem lançar erros se falhar)
    fs.unlink(htmlPath).catch(() => {});
    fs.unlink(pdfPath).catch(() => {});
  }
}
