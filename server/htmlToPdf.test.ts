/**
 * Teste do helper htmlToPdf — verifica que Puppeteer + Chromium gera PDF corretamente
 */
import { describe, expect, it } from "vitest";
import { htmlToPdf } from "./_core/htmlToPdf";

describe("htmlToPdf", () => {
  it("gera um PDF válido a partir de HTML simples", async () => {
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><title>Teste</title></head>
<body>
  <h1>Exclusive Club</h1>
  <p>Teste de geração de PDF sem Chrome.</p>
</body>
</html>`;

    const pdfBuffer = await htmlToPdf(html);

    // Verificar que retornou um Buffer
    expect(pdfBuffer).toBeInstanceOf(Buffer);

    // Verificar que o PDF tem tamanho razoável (> 1KB)
    expect(pdfBuffer.length).toBeGreaterThan(1000);

    // Verificar assinatura PDF (%PDF-)
    const header = pdfBuffer.slice(0, 5).toString("ascii");
    expect(header).toBe("%PDF-");
  }, 60000); // timeout de 60s pois Puppeteer pode demorar ao iniciar

  it("gera PDF com tabelas e estilos CSS", async () => {
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #0a3d6b; color: #fff; padding: 6px; }
  td { padding: 4px; border: 1px solid #ddd; }
</style>
</head>
<body>
  <h1>Notificação Extrajudicial</h1>
  <table>
    <thead><tr><th>#</th><th>Descrição</th><th>Valor</th></tr></thead>
    <tbody>
      <tr><td>1</td><td>Mensalidade</td><td>R$ 500,00</td></tr>
    </tbody>
  </table>
</body>
</html>`;

    const pdfBuffer = await htmlToPdf(html);

    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(1000);
    const header = pdfBuffer.slice(0, 5).toString("ascii");
    expect(header).toBe("%PDF-");
  }, 60000);
});
