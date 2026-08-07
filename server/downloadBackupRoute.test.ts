/**
 * O download precisa entregar um arquivo que ABRE.
 *
 * POR QUE ESTE TESTE EXISTE: o download redirecionava direto para o
 * armazenamento, entregando o `.zip.enc` cru — um arquivo cifrado que nenhum
 * programa abre. A queixa que chegou foi sobre a extensão, mas a extensão
 * estava certa: o arquivo ERA criptografado. Trocar só o nome para `.zip`
 * produziria um zip que não é zip, o que é pior — some o único sinal de que
 * havia algo errado.
 *
 * O que estes testes travam é a relação entre as duas coisas: a extensão só
 * perde o `.enc` porque o conteúdo deixou de ser cifrado.
 */

import { describe, expect, it } from "vitest";
import { nomeParaDownload } from "./downloadBackupRoute";
import {
  encryptBackupBuffer,
  decryptBackupBuffer,
  isEncryptedBackup,
} from "./backup";

const CHAVE = Buffer.from("uma-chave-de-teste-com-mais-de-32-caracteres", "utf8");

describe("nome do arquivo entregue", () => {
  it("remove o .enc, porque o conteúdo entregue já foi descriptografado", () => {
    expect(nomeParaDownload("exclusive-club-backup-2026-08-07T14-19-31-916Z.zip.enc")).toBe(
      "exclusive-club-backup-2026-08-07T14-19-31-916Z.zip",
    );
  });

  it("não mexe em backups antigos, que já eram .zip", () => {
    expect(nomeParaDownload("exclusive-club-backup-2026-06-14T18-23-16-181Z.zip")).toBe(
      "exclusive-club-backup-2026-06-14T18-23-16-181Z.zip",
    );
  });

  it("remove apenas o .enc final, não uma ocorrência no meio do nome", () => {
    expect(nomeParaDownload("backup.enc.fim.zip.enc")).toBe("backup.enc.fim.zip");
  });
});

describe("identificação do container criptografado", () => {
  it("reconhece um artefato criptografado por encryptBackupBuffer", () => {
    const cifrado = encryptBackupBuffer(Buffer.from("PK\x03\x04conteudo-zip"), CHAVE);
    expect(isEncryptedBackup(cifrado)).toBe(true);
  });

  it("NÃO confunde um zip comum com container criptografado", () => {
    // Backups anteriores à criptografia são zips em claro. Tentar
    // descriptografá-los quebraria o download de todo o histórico antigo.
    const zipEmClaro = Buffer.from("PK\x03\x04um zip de verdade");
    expect(isEncryptedBackup(zipEmClaro)).toBe(false);
  });

  it("não estoura com buffer menor que o cabeçalho", () => {
    expect(isEncryptedBackup(Buffer.from("PK"))).toBe(false);
    expect(isEncryptedBackup(Buffer.alloc(0))).toBe(false);
  });
});

describe("ida e volta", () => {
  it("o que sai da descriptografia é exatamente o zip original", () => {
    // É esta propriedade que torna legítimo entregar o arquivo como .zip.
    const original = Buffer.from("PK\x03\x04dados do backup do banco");
    const cifrado = encryptBackupBuffer(original, CHAVE);

    expect(cifrado.equals(original)).toBe(false);
    expect(decryptBackupBuffer(cifrado, CHAVE).equals(original)).toBe(true);
  });

  it("chave diferente falha em vez de devolver conteúdo corrompido", () => {
    // O GCM autentica: chave errada lança. Se devolvesse lixo silenciosamente,
    // o usuário baixaria um "zip" ilegível achando que o backup se perdeu.
    const cifrado = encryptBackupBuffer(Buffer.from("dados"), CHAVE);
    const outraChave = Buffer.from("outra-chave-completamente-diferente-32+", "utf8");

    expect(() => decryptBackupBuffer(cifrado, outraChave)).toThrow();
  });
});
