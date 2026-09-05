/**
 * O TLS do SMTP valida o certificado por padrão.
 *
 * POR QUE ESTE TESTE EXISTE: o transporte vinha fixo em
 * `rejectUnauthorized: false`, aceitando qualquer certificado — inclusive o de
 * alguém no meio do caminho se passando pelo servidor. Por essa conexão passam
 * a senha da caixa e o conteúdo dos emails (dados de clientes, cobranças,
 * contratos). Um `false` reintroduzido por descuido volta a ser silencioso, daí
 * fixar o padrão aqui.
 */
import { describe, expect, it, afterEach } from 'vitest';
import { opcoesTlsSmtp } from './emailService';

const original = process.env.SMTP_TLS_INSECURE;

afterEach(() => {
  if (original === undefined) delete process.env.SMTP_TLS_INSECURE;
  else process.env.SMTP_TLS_INSECURE = original;
});

describe('opcoesTlsSmtp', () => {
  it('valida o certificado quando nada está configurado', () => {
    delete process.env.SMTP_TLS_INSECURE;
    expect(opcoesTlsSmtp().rejectUnauthorized).toBe(true);
  });

  it('só afrouxa mediante o valor exato "true" — a saída de emergência exige ato explícito', () => {
    process.env.SMTP_TLS_INSECURE = 'true';
    expect(opcoesTlsSmtp().rejectUnauthorized).toBe(false);
  });

  it('não afrouxa com valores parecidos ("1", "yes", vazio)', () => {
    for (const valor of ['1', 'yes', 'sim', 'TRUE', '']) {
      process.env.SMTP_TLS_INSECURE = valor;
      expect(opcoesTlsSmtp().rejectUnauthorized).toBe(true);
    }
  });
});
