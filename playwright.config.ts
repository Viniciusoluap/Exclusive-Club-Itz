/**
 * Testes de ponta a ponta (Story 24 / SYS-07).
 *
 * O sistema inteiro sobe do zero contra um banco descartável, os testes rodam
 * dentro dele, e no fim tudo é jogado fora. Nenhum contato com o sistema real.
 *
 * SOBRE O NAVEGADOR: o Chromium já vem instalado no ambiente
 * (`PLAYWRIGHT_BROWSERS_PATH`), então nada é baixado. Em máquina que não o
 * tenha, `npx playwright install chromium` resolve.
 */

import fs from "fs";
import { defineConfig, devices } from "@playwright/test";
import { BANCO_E2E, SEGREDOS_E2E } from "./e2e/apoio/ambiente";

/**
 * Navegador já presente na máquina, quando houver.
 *
 * Alguns ambientes trazem o Chromium pré-instalado numa versão diferente da que
 * esta versão do Playwright baixaria. Apontar para o que existe evita baixar
 * centenas de megabytes a cada execução — e evita a falha "Executable doesn't
 * exist", que foi o que aconteceu aqui na primeira tentativa.
 *
 * Quando não existir (o caso do CI), fica indefinido e o Playwright usa o
 * navegador que ele mesmo instalou.
 */
const navegadorLocal = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome"].find(
  (caminho) => fs.existsSync(caminho),
);

const PORTA = 4321;
const BASE_URL = `http://127.0.0.1:${PORTA}`;

const urlDoBanco = (process.env.DATABASE_URL ?? "").replace(
  /\/[^/?]+(\?|$)/,
  `/${BANCO_E2E}$1`,
);

export default defineConfig({
  testDir: "./e2e",
  // Um fluxo por vez: eles compartilham o mesmo banco, e paralelizar criaria
  // interferência entre reservas, cobranças e estoque.
  workers: 1,
  fullyParallel: false,
  // Falhar rápido em CI é melhor do que insistir: teste de ponta a ponta que
  // falha por instabilidade costuma falhar de novo, e a fila fica cara.
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  timeout: 60_000,

  globalTeardown: "./e2e/apoio/encerrar.ts",

  use: {
    baseURL: BASE_URL,
    // O rastro só é guardado quando algo falha: é o que permite entender uma
    // falha de CI sem ter a máquina na mão.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: navegadorLocal ? { executablePath: navegadorLocal } : {},
      },
    },
  ],

  webServer: {
    command: "npx tsx e2e/apoio/criarBanco.ts && node dist/index.js",
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      NODE_ENV: "production",
      PORT: String(PORTA),
      DATABASE_URL: urlDoBanco,
      ...SEGREDOS_E2E,
    },
  },
});
