# Baseline de Migrations — 2026-07-19 (Story 6, Fase 1)

## O que mudou

O histórico de migrations anterior a esta data (`0000` a `0064`, 69 arquivos
`.sql` + seus snapshots em `meta/`) foi **arquivado**, não deletado, em
`drizzle/_archive-pre-baseline/`. Em seu lugar, `drizzle/0000_initial_baseline.sql`
é uma única migration gerada a partir do `drizzle/schema.ts` atual, que passa
a ser o novo ponto de partida (`idx: 0` em `drizzle/meta/_journal.json`).

## Por que

A auditoria técnica original (SYS-01 ≡ DB-04) já sinalizava esse histórico
como quebrado. Ao investigar de verdade para a Story 6, o escopo real era
maior do que o documentado:

1. **`0033_good_lila_cheney.sql`** fazia `ALTER TABLE ... DROP PRIMARY KEY`
   em 14 tabelas sem nunca recriar a chave — inválido em InnoDB/MySQL para
   coluna `AUTO_INCREMENT` (`ER_WRONG_AUTO_KEY`), só aceito em TiDB por causa
   de uma configuração específica de clustered-index.
2. **28 ocorrências, em 9 arquivos** (`0033`, `0034`, `0035`, `0040`, `0041`,
   `0043`, `0047`, `0048`, `0050`), de `DEFAULT 'CURRENT_TIMESTAMP'` — a
   palavra-chave `CURRENT_TIMESTAMP` entre aspas, como se fosse uma string
   literal, em vez do keyword bare. Rejeitado tanto por MySQL quanto por TiDB
   (`[ddl:1067] Invalid default value`).
3. **4 pares de arquivos com o mesmo número** (`0002`, `0003`, `0004`, `0062`)
   — reconstruindo a partir do conteúdo, são duas histórias alternativas
   divergentes de `client_quotas`/`maintenances` (provavelmente duas branches
   que rodaram `drizzle-kit generate` em paralelo antes de mergear). O
   `_journal.json` só referenciava uma de cada par; a outra nunca foi de fato
   aplicada a lugar nenhum — lixo de merge, não histórico real.

**Ponto central:** um arquivo `.sql` com erro de sintaxe/DDL inválido nunca
pôde ter rodado exatamente como está escrito. Isso significa que esses
arquivos nunca foram, de fato, um retrato fiel do que aconteceu em produção
— eram, na melhor das hipóteses, uma aproximação com bugs introduzidos em
algum momento (edição manual, merge, ou geração incorreta) depois da
aplicação real.

## Por que é seguro consolidar em vez de corrigir arquivo por arquivo

A produção real (TiDB Cloud) **já tem o schema correto** — isso foi
verificado de forma independente na Story 1 (Fase 0), quando `drizzle-kit
push --force` (que gera DDL direto do `schema.ts`, sem depender do journal)
foi usado exatamente porque `migrate` falhava nesses mesmos bugs. Ou seja,
`schema.ts` já é a fonte da verdade validada contra produção — o novo
baseline gerado a partir dele não introduz nem perde nenhuma coluna, índice
ou tabela.

## Verificação feita

- `drizzle-kit generate` a partir do `schema.ts` atual → `0000_initial_baseline.sql`.
- `drizzle-kit migrate` contra um banco MySQL 8.0 vazio → aplicou sem erro.
- `mysqldump --no-data` do banco resultante comparado com o banco produzido
  por `drizzle-kit push --force` (mesmo `schema.ts`) → **idêntico**, exceto
  pela tabela interna de bookkeeping `__drizzle_migrations` que só o
  `migrate` cria (esperado, não é uma tabela da aplicação).
- **Limitação desta verificação:** feita contra MySQL 8.0 vanilla local, não
  contra TiDB (o motor real de produção). O `ci.yml` já roda TiDB efêmero e
  passa a usar `drizzle-kit migrate` neste mesmo commit — a confirmação final
  contra TiDB acontece lá.

## Dado NÃO coberto por este baseline

Nenhum. O baseline reflete o `schema.ts` completo no momento da geração —
qualquer tabela/coluna/índice que já existia em produção e está em
`schema.ts` está no baseline.

## Daqui pra frente

- Toda nova mudança de schema usa `pnpm run db:push` (gera migration +
  aplica) normalmente, a partir do `0000_initial_baseline.sql`.
- O histórico arquivado em `drizzle/_archive-pre-baseline/` fica só como
  trilha de auditoria — não é replayable e não deve ser usado para
  provisionar bancos novos.
