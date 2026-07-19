import { describe, expect, it, afterEach } from 'vitest';
import {
  getBackupEncryptionKey,
  encryptBackupBuffer,
  decryptBackupBuffer,
} from './backup';

const ORIGINAL_KEY = process.env.BACKUP_ENCRYPTION_KEY;

afterEach(() => {
  if (ORIGINAL_KEY === undefined) {
    delete process.env.BACKUP_ENCRYPTION_KEY;
  } else {
    process.env.BACKUP_ENCRYPTION_KEY = ORIGINAL_KEY;
  }
});

describe('getBackupEncryptionKey (SYS-22 fail-fast)', () => {
  it('lança quando a chave não está configurada', () => {
    delete process.env.BACKUP_ENCRYPTION_KEY;
    expect(() => getBackupEncryptionKey()).toThrow(/não configurada/i);
  });

  it('lança quando a chave é muito curta', () => {
    process.env.BACKUP_ENCRYPTION_KEY = 'curta-demais';
    expect(() => getBackupEncryptionKey()).toThrow(/muito curta/i);
  });

  it('retorna a chave quando válida', () => {
    process.env.BACKUP_ENCRYPTION_KEY = 'x'.repeat(48);
    const key = getBackupEncryptionKey();
    expect(Buffer.isBuffer(key)).toBe(true);
    expect(key.length).toBe(48);
  });
});

describe('encryptBackupBuffer / decryptBackupBuffer (AES-256-GCM)', () => {
  const keyMaterial = Buffer.from('chave-de-teste-para-backup-com-entropia-suficiente', 'utf8');

  it('faz roundtrip encrypt -> decrypt preservando o conteúdo', () => {
    const plaintext = Buffer.from('-- SQL dump com PII de sócios\nINSERT INTO users ...', 'utf8');
    const encrypted = encryptBackupBuffer(plaintext, keyMaterial);

    // O artefato criptografado não deve conter o texto em claro.
    expect(encrypted.includes(Buffer.from('INSERT INTO users'))).toBe(false);

    const decrypted = decryptBackupBuffer(encrypted, keyMaterial);
    expect(decrypted.equals(plaintext)).toBe(true);
  });

  it('gera IV/salt aleatórios (dois ciphertexts diferentes para o mesmo input)', () => {
    const plaintext = Buffer.from('mesmo conteúdo', 'utf8');
    const a = encryptBackupBuffer(plaintext, keyMaterial);
    const b = encryptBackupBuffer(plaintext, keyMaterial);
    expect(a.equals(b)).toBe(false);
    expect(decryptBackupBuffer(a, keyMaterial).equals(plaintext)).toBe(true);
    expect(decryptBackupBuffer(b, keyMaterial).equals(plaintext)).toBe(true);
  });

  it('rejeita adulteração do ciphertext (auth tag do GCM)', () => {
    const plaintext = Buffer.from('conteúdo íntegro', 'utf8');
    const encrypted = encryptBackupBuffer(plaintext, keyMaterial);
    // Corrompe o último byte (dentro do ciphertext).
    encrypted[encrypted.length - 1] ^= 0xff;
    expect(() => decryptBackupBuffer(encrypted, keyMaterial)).toThrow();
  });

  it('rejeita descriptografia com chave incorreta', () => {
    const plaintext = Buffer.from('segredo', 'utf8');
    const encrypted = encryptBackupBuffer(plaintext, keyMaterial);
    const wrongKey = Buffer.from('chave-completamente-diferente-mas-longa-o-bastante', 'utf8');
    expect(() => decryptBackupBuffer(encrypted, wrongKey)).toThrow();
  });

  it('rejeita container com magic inválido', () => {
    const bogus = Buffer.alloc(60, 0);
    expect(() => decryptBackupBuffer(bogus, keyMaterial)).toThrow(/magic/i);
  });
});
