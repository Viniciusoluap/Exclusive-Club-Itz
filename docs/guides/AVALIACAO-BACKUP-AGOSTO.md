# Avaliação do backup de agosto — Exclusive Clube

**Autor:** Manus AI

**Data da avaliação:** 26 de agosto de 2026

**Repositório:** [Viniciusoluap/Exclusive-Club-Itz](https://github.com/Viniciusoluap/Exclusive-Club-Itz)

**Artefato analisado:** `exclusive-club-backup-2026-08-14T02-56-35-946Z.zip`

## Decisão executiva

O backup de agosto está **apto para ser usado como fonte principal da recuperação histórica**, e deve substituir o backup antigo de fevereiro como referência operacional. Ele não deve ser importado diretamente por cima de qualquer banco existente. A forma recomendada é restaurá-lo em uma base nova e isolada, aplicar as migrações atuais do sistema, validar os dados contra o Asaas e somente depois decidir a troca da conexão de produção.

A integridade do arquivo foi confirmada, todas as tabelas obrigatórias estão presentes, o SQL possui marcador de conclusão e não apresenta truncamento detectado. A cópia preparada remove a view financeira legada `financial_charges`, que dependia das tabelas antigas de assinaturas, e normaliza os cinco nomes camelCase da tabela `users` para o padrão snake_case adotado pela `main` atual.

> **Conclusão:** usar o backup de agosto, mas por restauração controlada em base nova, seguida de autoMigração, reconciliação Asaas e validação de contagens e saldos. Não fazer restauração bruta sobre a base ativa.

## Evidências do arquivo

| Verificação | Resultado | Interpretação |
|---|---:|---|
| Data do snapshot | 14/08/2026 | Mais recente que o arquivo de 25/02/2026 |
| ZIP | Íntegro | `unzip -t` sem erros de dados comprimidos |
| SHA-256 do ZIP | `ee6326148728fc0c8bd2fdefc6f408f2c8c8f56599e42985d85b3f17834dddd6` | Identificação imutável do artefato local analisado |
| SQL extraído | 3.364.811 bytes / 9.401 linhas | Conteúdo completo para análise estrutural |
| Tabelas | 30 | Estrutura consistente com a fase financeira atual |
| Tabelas obrigatórias | 9 de 9 presentes | Pode ser preparado para restauração |
| Marcador de conclusão | Presente | O dump não parece interrompido |
| `FOREIGN_KEY_CHECKS` | Abertura e fechamento presentes | Ordem de importação preservada |
| Instruções `DROP TABLE` | 30 | Permitidas somente em base nova e vazia |
| View `financial_charges` | Removida na cópia preparada | Evita reintroduzir o modelo legado de assinaturas |
| Tabelas Open Finance | Ausentes | Serão criadas pela migração `0008_open_finance` |

## Conteúdo recuperável

O snapshot contém dados substanciais da operação, sobretudo na estrutura financeira consolidada que não existia no backup antigo.

| Conjunto | Registros no backup de agosto |
|---|---:|
| Clientes autorizados | 42 |
| Clientes Asaas | 23 |
| Cobranças `bpo_charges` | 3.163 |
| Despesas `expense_records` | 2.962 |
| Anexos de backup | 243 |
| Logs de webhook | 488 |
| Reservas | 172 |
| Cotas de clientes | 625 |
| Vistorias | 85 |
| Abastecimentos | 95 |
| Compras de combustível | 51 |
| Solicitações de alteração de vencimento | 9 |
| Embarcações | 2 |
| Usuários | 37 |

O backup antigo de fevereiro tinha apenas 28 tabelas e 300.235 bytes, não possuía `bpo_charges` nem `expense_records` e dependia do modelo legado `subscription_charges`, `subscriptions` e `unclassified_charges`. O backup de agosto, com 30 tabelas e 3.364.811 bytes, é claramente a fonte mais próxima da operação financeira consolidada atual.

## Compatibilidade com a `main`

A compatibilidade é **alta após preparação**, mas não é perfeita em uma importação literal. Foram encontrados três pontos que precisam ser tratados explicitamente.

| Ponto | Situação | Tratamento recomendado |
|---|---|---|
| `users` | O dump usa `openId`, `loginMethod`, `createdAt`, `updatedAt` e `lastSignedIn`; a `main` usa snake_case | O preparador renomeia somente esses identificadores na cópia `restore.sql`; o ZIP original permanece intacto |
| `bpo_charges` | O backup possui também `ignored` e `yearly_adjustment`, que não estão representados no schema atual | Manter as colunas no banco restaurado para não perder informação; não removê-las automaticamente. A exposição funcional desses campos deve ser tratada em uma story própria |
| View `financial_charges` | A view referencia `subscription_charges`, `subscriptions` e o modelo legado | Remover apenas na cópia preparada; a `main` trabalha com `bpo_charges` |
| Open Finance | As tabelas `open_finance_*` não estão no backup | Aplicar a migração atual `0008_open_finance` depois da restauração |

O histórico Git confirma que o modelo legado foi removido da definição principal em 15/04/2026, no commit `5375f523a359e04966a036feb8bc5d8b78d64e1c`, enquanto o snapshot de agosto ainda preserva alguns objetos legados vazios. Isso reforça a decisão de recuperar os dados úteis sem restaurar cegamente as estruturas antigas.

## Como a restauração funcionará

### 1. Base isolada

Provisionar uma base nova ou um branch separado do banco, por exemplo `exclusive_club_recovery_aug_2026`. O banco ativo não será utilizado como destino do SQL. A presença de `DROP TABLE` no arquivo preparado é aceitável somente porque o destino será vazio e descartável.

### 2. Importação preparada

Usar o arquivo `recovery/new_backup/restore.sql`, gerado por `scripts/prepare_backup_restore.mjs`. O script é somente preparatório: não abre conexão, não lê credenciais, não importa dados e não modifica o ZIP do Drive.

A cópia preparada faz três coisas controladas: valida as tabelas obrigatórias e os marcadores de conclusão; remove a view legada `financial_charges`; e normaliza os identificadores camelCase de `users` para os nomes que o código atual consulta.

### 3. AutoMigração atual

A `main` possui o journal com `0000_initial_baseline` até `0008_open_finance`. A lógica atual de autoMigração reconhece que o dump já contém tabelas de negócio e que seus 13 hashes antigos não correspondem às migrações atuais. Nesse cenário, ela adota o baseline sem executar novamente o DDL inicial e aplica as migrações incrementais pendentes, inclusive a criação das tabelas Open Finance.

A sequência esperada é `baseline-adotado`, seguida da aplicação das migrações incrementais. Qualquer erro de chave única, coluna incompatível ou dado conflitante deve interromper a promoção, e não ser ignorado.

### 4. Reconciliação com o Asaas

O Asaas continua sendo a fonte de verdade para situação, vencimento, pagamento e identificação das cobranças financeiras. O backup fornece o estado histórico local, descrições, classificações, despesas e vínculos operacionais. O fluxo deve executar primeiro o `dry-run` de `scripts/asaas_rebuild.mjs`, sem exclusões, e produzir uma tabela de divergências por `asaas_charge_id`, `asaas_customer_id`, email, valor, vencimento e status.

Somente após revisar as divergências será permitido o modo de aplicação. O modo de aplicação deve ser idempotente, preservar classificações e não apagar cobranças locais ou clientes sem uma regra explícita de reconciliação.

### 5. Validação antes da promoção

Antes de trocar o `DATABASE_URL` da produção, validar as contagens das tabelas, chaves únicas, usuários administradores, clientes Asaas, cobranças abertas, cobranças vencidas, despesas, anexos e logs. Em seguida, executar o CI e os smoke tests do site. A promoção deve ser feita por troca reversível da conexão do ambiente, mantendo a base antiga intacta para rollback.

## Estado da publicação do site

O site está publicado em [https://exclusive-club-itz.vercel.app/](https://exclusive-club-itz.vercel.app/). O problema que fazia a raiz entregar JavaScript do servidor, em vez da aplicação HTML, foi corrigido. O roteamento Vercel agora envia `/api/*` ao Express serverless e mantém o fallback SPA apenas para o frontend.

O smoke test de produção confirmou a raiz com `200 text/html`, o título `Exclusive Club` e a procedure tRPC `auth.me` com `200 application/json` para visitante não autenticado. O problema visual de login mostrado no navegador era um redirecionamento de autenticação Vercel/Apple travado; ele é separado do runtime da aplicação. A Home pública agora carrega sem depender de variáveis OAuth ausentes, mas o login real ainda depende da configuração segura das variáveis OAuth no ambiente Vercel.

## Riscos que permanecem

O maior risco é importar o SQL em uma base que contenha dados, pois o dump possui `DROP TABLE`. O segundo é assumir que o snapshot de agosto já contém as tabelas Open Finance; ele não contém, portanto a migração atual é obrigatória. O terceiro é promover valores do backup como verdade financeira sem reconciliação: o Asaas deve prevalecer para o status atual das cobranças. O quarto é eliminar as colunas extras de `bpo_charges`; elas devem permanecer até que se decida formalmente se serão reintroduzidas no domínio da aplicação.

## Próxima execução recomendada

A próxima operação segura é provisionar a base isolada, importar `restore.sql`, iniciar a `main` apontando temporariamente para essa base e executar a autoMigração. Depois, executar o dry-run Asaas e gerar o relatório de divergências. Nenhuma etapa exige que uma senha seja enviada pelo chat: os valores devem ser inseridos diretamente no ambiente seguro da hospedagem.

## Referências

[1]: https://github.com/Viniciusoluap/Exclusive-Club-Itz "Repositório oficial Exclusive Club Itz"
[2]: https://exclusive-club-itz.vercel.app/ "Aplicação publicada Exclusive Club"
[3]: https://vercel.com/docs/project-configuration/vercel-json "Configuração de rotas Vercel"
[4]: https://vercel.com/kb/guide/why-is-my-deployed-project-giving-404 "Guia Vercel sobre respostas 404"
[5]: https://docs.asaas.com/reference/list-payments "Referência oficial Asaas — listagem de cobranças"
