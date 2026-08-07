/**
 * Conferência do conteúdo de um backup contra o banco vivo.
 *
 * POR QUE EXISTE: tudo que foi construído até aqui prova que o backup é
 * GERADO corretamente. Nada provava que ele contém o que deveria conter. Um
 * backup que ninguém nunca abriu é uma hipótese, e a diferença entre hipótese
 * e garantia só aparece no pior momento possível.
 *
 * Esta conferência abre o artefato de verdade — descriptografa, extrai o zip,
 * lê o SQL — e compara tabela por tabela com o banco atual. Não restaura nada,
 * não altera nada, não toca em dado nenhum.
 *
 * SOBRE AS DIFERENÇAS DE CONTAGEM: o backup é uma foto de um instante. Linhas
 * criadas depois dele existem no banco e não no arquivo — isso é esperado, não
 * é defeito. O que denuncia problema de verdade é tabela AUSENTE do backup, ou
 * tabela que tinha dados e apareceu vazia. O relatório separa as duas coisas,
 * porque um alarme que dispara à toa deixa de ser levado a sério.
 */

import zlib from "zlib";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------- leitor ZIP

/**
 * Extrai o primeiro arquivo `.sql` de um zip.
 *
 * Leitor mínimo em vez de dependência nova: o `archiver` do projeto só escreve.
 * A leitura começa pelo fim (End of Central Directory), que é o único ponto de
 * entrada confiável — o cabeçalho local pode ter tamanhos zerados quando o zip
 * foi escrito em streaming, que é exatamente como o backup é gerado.
 */
export function extrairSqlDoZip(zip: Buffer): string {
  const EOCD_SIG = 0x06054b50;
  const CEN_SIG = 0x02014b50;

  // O EOCD tem 22 bytes + comentário (até 64 KB). Procura de trás para frente.
  let eocd = -1;
  const limite = Math.max(0, zip.length - 22 - 0xffff);
  for (let i = zip.length - 22; i >= limite; i--) {
    if (zip.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Arquivo não é um ZIP válido (fim do diretório central não encontrado).");

  const totalEntradas = zip.readUInt16LE(eocd + 10);
  let ponteiro = zip.readUInt32LE(eocd + 16);

  for (let n = 0; n < totalEntradas; n++) {
    if (zip.readUInt32LE(ponteiro) !== CEN_SIG) {
      throw new Error("Diretório central do ZIP corrompido.");
    }
    const metodo = zip.readUInt16LE(ponteiro + 10);
    const tamanhoComprimido = zip.readUInt32LE(ponteiro + 20);
    const tamNome = zip.readUInt16LE(ponteiro + 28);
    const tamExtra = zip.readUInt16LE(ponteiro + 30);
    const tamComentario = zip.readUInt16LE(ponteiro + 32);
    const offsetLocal = zip.readUInt32LE(ponteiro + 42);
    const nome = zip.subarray(ponteiro + 46, ponteiro + 46 + tamNome).toString("utf8");

    if (nome.toLowerCase().endsWith(".sql")) {
      // Os tamanhos de nome/extra do cabeçalho LOCAL podem diferir dos do
      // central — é preciso reler ali para achar onde os dados começam.
      const localTamNome = zip.readUInt16LE(offsetLocal + 26);
      const localTamExtra = zip.readUInt16LE(offsetLocal + 28);
      const inicio = offsetLocal + 30 + localTamNome + localTamExtra;
      const dados = zip.subarray(inicio, inicio + tamanhoComprimido);

      if (metodo === 0) return dados.toString("utf8"); // sem compressão
      if (metodo === 8) return zlib.inflateRawSync(dados).toString("utf8"); // deflate
      throw new Error(`Método de compressão não suportado no ZIP: ${metodo}`);
    }

    ponteiro += 46 + tamNome + tamExtra + tamComentario;
  }

  throw new Error("Nenhum arquivo .sql encontrado dentro do backup.");
}

// ------------------------------------------------------------- leitor de SQL

/**
 * Conta as linhas de cada tabela dentro do dump.
 *
 * O parser respeita literais de texto (com `''` como aspa escapada) em vez de
 * usar expressão regular. Um campo de observação contendo `(` ou `;` faria uma
 * contagem ingênua errar — e uma conferência que erra é pior que nenhuma,
 * porque acusa problema onde não há e some quando há.
 */
export function contarLinhasNoDump(dump: string): Map<string, number> {
  const contagem = new Map<string, number>();

  let i = 0;
  let dentroDeTexto = false;
  let tabelaAtual: string | null = null;
  let dentroDeValues = false;
  let profundidade = 0;

  const INSERT = "INSERT INTO ";

  while (i < dump.length) {
    const c = dump[i];

    if (dentroDeTexto) {
      if (c === "'") {
        // Duas aspas seguidas são uma aspa literal, não o fim do texto.
        if (dump[i + 1] === "'") i++;
        else dentroDeTexto = false;
      }
      i++;
      continue;
    }

    if (c === "'") {
      dentroDeTexto = true;
      i++;
      continue;
    }

    if (dentroDeValues) {
      if (c === "(") {
        // Só o parêntese de nível zero abre uma nova linha de dados.
        if (profundidade === 0 && tabelaAtual) {
          contagem.set(tabelaAtual, (contagem.get(tabelaAtual) ?? 0) + 1);
        }
        profundidade++;
      } else if (c === ")") {
        profundidade--;
      } else if (c === ";" && profundidade === 0) {
        dentroDeValues = false;
      }
      i++;
      continue;
    }

    if (dump.startsWith(INSERT, i)) {
      const abre = dump.indexOf("`", i);
      const fecha = abre >= 0 ? dump.indexOf("`", abre + 1) : -1;
      if (abre >= 0 && fecha > abre) {
        tabelaAtual = dump.slice(abre + 1, fecha);
        if (!contagem.has(tabelaAtual)) contagem.set(tabelaAtual, 0);

        // Pula a lista de colunas e começa a contar depois de VALUES.
        const values = dump.indexOf("VALUES", fecha);
        if (values >= 0) {
          i = values + "VALUES".length;
          dentroDeValues = true;
          profundidade = 0;
          continue;
        }
      }
    }

    i++;
  }

  return contagem;
}

/** Tabelas cuja estrutura está no dump (mesmo sem nenhuma linha). */
export function tabelasNoDump(dump: string): Set<string> {
  const encontradas = new Set<string>();
  const re = /CREATE TABLE `([^`]+)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(dump)) !== null) encontradas.add(m[1]);
  return encontradas;
}

// ------------------------------------------------------------- comparação

export type LinhaDoRelatorio = {
  tabela: string;
  noBanco: number;
  noBackup: number;
  /** A tabela nem existe no backup — é a falha que importa. */
  ausente: boolean;
  /** Tinha dados no banco e veio vazia no backup. */
  vaziaNoBackup: boolean;
};

export type RelatorioVerificacao = {
  tabelasNoBanco: number;
  tabelasNoBackup: number;
  registrosNoBanco: number;
  registrosNoBackup: number;
  problemas: LinhaDoRelatorio[];
  detalhes: LinhaDoRelatorio[];
  /** Nenhuma tabela ausente nem esvaziada. */
  integro: boolean;
};

/** Contagem real de cada tabela do banco vivo. */
export async function contarLinhasNoBanco(db: any): Promise<Map<string, number>> {
  const raw = (await db.execute(sql`SHOW TABLES`)) as any;
  const rows = Array.isArray(raw[0]) ? raw[0] : raw;
  const nomes = (Array.isArray(rows) ? rows : []).map((r: any) => String(Object.values(r)[0]));

  const contagem = new Map<string, number>();
  for (const nome of nomes) {
    const r = (await db.execute(sql.raw(`SELECT COUNT(*) AS total FROM \`${nome}\``))) as any;
    const linhas = Array.isArray(r[0]) ? r[0] : r;
    contagem.set(nome, Number(linhas?.[0]?.total ?? 0));
  }
  return contagem;
}

export function compararComBanco(
  noBanco: Map<string, number>,
  dump: string,
): RelatorioVerificacao {
  const estruturaBackup = tabelasNoDump(dump);
  const linhasBackup = contarLinhasNoDump(dump);

  const detalhes: LinhaDoRelatorio[] = [];
  for (const [tabela, qtdBanco] of Array.from(noBanco.entries()).sort()) {
    const qtdBackup = linhasBackup.get(tabela) ?? 0;
    const ausente = !estruturaBackup.has(tabela);
    detalhes.push({
      tabela,
      noBanco: qtdBanco,
      noBackup: qtdBackup,
      ausente,
      vaziaNoBackup: !ausente && qtdBanco > 0 && qtdBackup === 0,
    });
  }

  const problemas = detalhes.filter((d) => d.ausente || d.vaziaNoBackup);

  return {
    tabelasNoBanco: noBanco.size,
    tabelasNoBackup: estruturaBackup.size,
    registrosNoBanco: Array.from(noBanco.values()).reduce((a, b) => a + b, 0),
    registrosNoBackup: Array.from(linhasBackup.values()).reduce((a, b) => a + b, 0),
    problemas,
    detalhes,
    integro: problemas.length === 0,
  };
}
