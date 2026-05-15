/**
 * htmlToPdf.ts — Converte HTML para PDF usando Puppeteer + Chromium
 *
 * Detecta automaticamente o executável do Chromium disponível no sistema,
 * sem necessidade de configuração manual. Usa o mesmo padrão do inspectionPDF.ts.
 */
import { existsSync } from "fs";
import puppeteer from "puppeteer";

/**
 * Detecta o caminho do executável do Chromium disponível no sistema.
 * Tenta múltiplos caminhos conhecidos em ordem de preferência.
 */
function findChromiumExecutable(): string {
  // Variável de ambiente tem prioridade máxima
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  // Lista de caminhos conhecidos em ordem de preferência
  const candidates = [
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/lib/chromium-browser/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/snap/bin/chromium",
    "/opt/google/chrome/chrome",
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  // Fallback: deixar o puppeteer tentar encontrar por conta própria
  return "";
}

/**
 * Converte uma string HTML em um Buffer PDF usando Puppeteer + Chromium.
 *
 * @param html - String HTML completa (com <!DOCTYPE html> e estilos inline)
 * @returns Buffer com o conteúdo do PDF gerado
 */
export async function htmlToPdf(html: string): Promise<Buffer> {
  const executablePath = findChromiumExecutable();

  const launchOptions: Parameters<typeof puppeteer.launch>[0] = {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  };

  if (executablePath) {
    launchOptions.executablePath = executablePath;
  }

  const browser = await puppeteer.launch(launchOptions);

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "20px",
        right: "20px",
        bottom: "20px",
        left: "20px",
      },
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}
