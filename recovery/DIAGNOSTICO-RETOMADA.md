# Diagnóstico de retomada — Exclusive Club

**Data:** 26/08/2026  
**Responsável pela análise:** Manus AI  
**Escopo:** reimplantação do sistema, avaliação do backup de fevereiro, preservação das mudanças já mergeadas, retomada do financeiro com o Asaas e delimitação da integração TecnoSpeed.

> **Aviso de decisão:** este documento é uma análise técnica para aprovação. Nenhum banco de produção foi alterado, nenhum backup foi restaurado sobre uma base ativa, nenhuma cobrança foi criada/cancelada e nenhuma chave foi rotacionada.

## 1. Conclusão executiva

O código-fonte não foi perdido. A `main` auditada está no repositório `Viniciusoluap/Exclusive-Club-Itz`, commit `329fe741b563526ec7c3828cd4d9dc9b6b299ec1`, e o último CI registrado em 17/08/2026 terminou com sucesso nos jobs de typecheck/test/build e fluxos de ponta a ponta. O resumo original menciona `Viniciusoluap/exclusive-club-reservas`, mas o repositório efetivamente encontrado e auditado foi o primeiro acima; essa divergência deve ser confirmada antes da reconexão da hospedagem.

O backup localizado no Google Drive é real e íntegro como arquivo ZIP, mas é um snapshot de 25/02/2026 de um modelo financeiro anterior. Ele contém 28 tabelas e dados úteis, incluindo clientes, reservas, embarcações, abastecimentos, vistorias, logs e tabelas financeiras legadas. Ele **não deve ser restaurado diretamente sobre a base que o código atual espera**. A restauração bruta não apagaria o código do GitHub, mas poderia substituir o banco por um schema anterior, ausente de `bpo_charges`, `expense_records` e `backup_attachments`, quebrando o fluxo financeiro novo e as funções de backup, migração e reconciliação já mergeadas.

A retomada correta é: **código atual da `main` + banco novo MySQL/TiDB + migrações atuais + carga controlada do Asaas como fonte financeira viva + importação seletiva do backup antigo**. O dump de fevereiro deve ser tratado como fonte histórica, não como banco de produção. A carga deve ser idempotente, não destrutiva, com relatório de conflitos e validação dos totais antes da ativação operacional.

A integração TecnoSpeed ainda não aparece implementada no código atual. A documentação oficial encontrada descreve uma API de pagamentos bancários a pagar — pagador, contas, pagamentos, remessa, retorno e conciliação — e não substitui o Asaas como fonte de cobranças a receber. Portanto, são dois fluxos distintos: Asaas para recebíveis de clientes; TecnoSpeed, se esse for o produto contratado, para pagamentos/contas a pagar e conciliação bancária.

## 2. Estado comprovado do repositório

| Item | Evidência | Diagnóstico |
|---|---|---|
| Fonte de código | `Viniciusoluap/Exclusive-Club-Itz`, branch `main` | Código preservado e auditável |
| Último CI | Run `31991665482`, concluído com `success` em 17/08/2026 | O commit auditado passou no CI hospedado |
| Build marker atual | `2026-08-17.2-conferencia-de-contas` em `server/_core/buildInfo.ts` | Serve para confirmar qual versão está realmente no ar |
| Migração na subida | `server/_core/autoMigrate.ts` e chamada em `server/_core/index.ts` | Banco vazio aplica migrações; banco existente pode adotar baseline sem DDL destrutivo |
| Modelo financeiro atual | `drizzle/schema.ts`: `bpo_charges`, `expense_records`, `asaas_customers`, `webhook_logs` | `bpo_charges` é a fonte atual do BPO financeiro |
| Backup atual | AES-256-GCM, com exclusão de `.env`, tokens OAuth e credenciais em `server/backup.ts` | A lógica nova é diferente do backup antigo; não usar o guia legado cegamente |
| Deploy | Não há deploy automático registrado no CI; a documentação indica sincronizar e publicar manualmente | A publicação precisa ser confirmada no painel da hospedagem |

A validação local reproduziu `pnpm install`, typecheck e build com sucesso. Os testes locais não puderam ser considerados conclusivos porque o sandbox não possui `DATABASE_URL` nem um TiDB efêmero: 66 arquivos passaram, 7 foram pulados e 46 falharam por ausência de banco/ambiente. Isso é limitação de infraestrutura local, não evidência suficiente de regressão no código; o CI hospedado, que inicia TiDB efêmero, passou.

## 3. O que existe no backup de 25/02/2026

O arquivo localizado é `exclusive-club-backup-2026-02-25T00-03-58-718Z.zip`, com aproximadamente 12,68 MB. A inspeção foi somente leitura. O dump contém 28 tabelas e dados distribuídos da seguinte forma:

| Grupo | Tabelas encontradas | Observação |
|---|---|---|
| Identidade e cadastro | `users`, `allowed_clients`, `employees`, `vessels`, `client_quotas` | Úteis para recuperar cadastros, mas exigem conferência de duplicidade e identidade |
| Operação | `bookings`, `inspections`, `inspection_charges`, `fuel_records`, `fuel_record_containers`, `fuel_purchases`, `fuel_budget`, `gallon_stock`, `maintenances`, `due_date_change_requests`, `reviews` | Podem alimentar a operação histórica depois de validar o schema |
| Asaas/cache | `asaas_customers`, `asaas_payments` | Podem ajudar a reconstruir vínculos, mas a fonte viva deve ser consultada novamente |
| Financeiro legado | `subscription_charges`, `subscriptions`, `unclassified_charges`, `excluded_asaas_charges`, `payment_audit_logs`, `payment_reconciliations` | Modelo anterior, não equivalente direto a `bpo_charges` |
| Auditoria e configuração | `backup_history`, `system_settings`, `webhook_logs`, `__drizzle_migrations` | Contêm histórico/configuração antiga; segredos nunca devem ser reaproveitados cegamente |

O dump tem, entre outros registros, 392 linhas em `subscription_charges`, 190 em `unclassified_charges`, 18 em `asaas_payments`, 12 em `asaas_customers` e 33 em `payment_audit_logs`. A `main` atual removeu as tabelas financeiras legadas do schema declarativo e introduziu `bpo_charges`, `expense_records` e `backup_attachments`. Essa diferença é estrutural, não apenas de nome de tabela.

## 4. Resposta objetiva à dúvida sobre usar o backup

### O backup pode recuperar parte do sistema?

Sim. Ele é útil para recuperar dados históricos e relacionamentos, principalmente cadastros, reservas, embarcações, abastecimentos, vistorias, cobranças legadas, descrições e vínculos Asaas que ainda existiam em fevereiro. Ele não é suficiente para recuperar automaticamente o estado de agosto, nem substitui a conta Asaas atual, que é a fonte mais confiável para cobranças e status financeiros posteriores ao snapshot.

### Restaurar o ZIP sobre o novo banco afetaria as funções novas?

Sim, se a restauração for feita como overwrite do banco. O ZIP contém schema e código antigos, enquanto a `main` atual espera o modelo novo. O efeito provável seria uma combinação de incompatibilidades: ausência de `bpo_charges`, ausência de `expense_records`, ausência do controle incremental de anexos, histórico de migrações divergente, tabelas financeiras legadas e possível incompatibilidade com o webhook atual. O código do GitHub continuaria preservado, mas o banco ficaria em estado incompatível até uma nova migração/reconstrução.

### O backup deve ser descartado?

Não. A estratégia segura é manter o ZIP original intocado e usar uma cópia somente leitura para extração seletiva. O caminho recomendado é carregar o dump em um banco de staging isolado, fazer consultas de transformação e produzir um relatório de mapeamento. Só depois os dados aprovados seriam inseridos na base nova por um importador idempotente.

## 5. Riscos críticos identificados

| Risco | Severidade | Consequência | Contenção |
|---|---:|---|---|
| Restauração bruta do dump antigo | Crítica | Banco incompatível com o schema atual e possível interrupção do sistema | Não restaurar sobre produção; usar staging + ETL seletivo |
| Chave de backup perdida | Crítica | Backups criptografados antigos podem ser irrecuperáveis sem a chave original | Gerar nova chave para a nova instalação e guardá-la fora da hospedagem; não afirmar recuperabilidade dos backups criptografados antigos |
| Token de webhook versionado em documentação antiga | Crítica | Segredo exposto no histórico do repositório | Tratar como comprometido; não reutilizar; emitir novo token após o deploy e revisar histórico/controle de acesso |
| Chave Asaas antiga armazenada/cifrada no dump | Alta | Dependência da chave e do segredo de cifragem antigos; risco de comprometimento | Configurar uma chave Asaas nova/confirmada fora do dump; não copiar `system_settings` cegamente |
| Importador histórico destrutivo | Crítica | `scripts/run_reimport.mjs` executa `DELETE FROM bpo_charges` | Não executar; criar fluxo dry-run e upsert não destrutivo |
| Mapeamento incompleto de clientes | Alta | Cobrança atribuída ao cliente errado ou deixada sem vínculo | Paginação completa do Asaas; matching por ID, e-mail normalizado e CPF/CNPJ; conflitos vão para revisão manual |
| Migrações em banco novo versus banco antigo | Alta | Falha de inicialização ou DDL inadequado | Banco novo com journal atual; validar `/admin/diagnostico`; não executar `db:push` legado |
| TecnoSpeed sem escopo confirmado | Alta | Construção do fluxo errado e risco operacional em pagamentos | Confirmar produto, banco, ambiente de homologação, webhook e fluxo antes de implementar |

## 6. Asaas: o que já existe e o que precisa ser corrigido antes da carga

O código atual possui endpoint `/api/webhooks/asaas`, valida o header `asaas-access-token`, processa somente eventos financeiros relevantes, usa comparação em tempo constante, grava log idempotente por evento + pagamento e só responde sucesso depois do processamento. A documentação oficial do Asaas recomenda proteger o endpoint, validar o header `asaas-access-token` e usar token dedicado com 32 a 255 caracteres, sem espaços e sem reutilizar uma API Key [1].

O serviço atual também possui listagem paginada de clientes e cobranças, mas a função chamada `listAllAsaasCustomers` busca apenas uma página por chamada. Para a carga inicial, ela precisa ser usada dentro de um paginador completo ou ser corrigida para percorrer todas as páginas. O cron atual é incremental e consulta apenas uma janela recente; ele não substitui uma carga histórica completa.

Há ainda dois caminhos históricos de reimportação no repositório que não devem ser executados cegamente. Eles dependem de tabelas antigas, tentam recuperar a chave Asaas de `system_settings`, usam lógica de criptografia anterior e, em um caso, apagam integralmente `bpo_charges`. Eles devem ser tratados como referência de intenção, não como procedimento de produção.

A carga inicial proposta é exclusivamente de leitura na API externa e de escrita controlada na base nova:

1. Consultar todos os clientes e todas as cobranças com paginação e registrar um snapshot local da resposta, sem criar, cancelar ou alterar cobranças no Asaas.
2. Mapear `asaas_customer_id` para `allowed_clients` por ID conhecido, depois por e-mail normalizado e, quando disponível, por CPF/CNPJ. Ambiguidades não serão atribuídas automaticamente.
3. Fazer upsert de cobranças por `asaas_charge_id`, preservando valor, valor líquido, valor pago, vencimento, pagamento, status, tipo de cobrança, descrição, referência externa e URLs.
4. Preservar classificações manuais e cobranças existentes; nenhuma linha será apagada durante a importação.
5. Registrar cobranças sem vínculo em `bpo_charges` com `client_id` nulo e relatório para revisão, em vez de inventar um cliente.
6. Comparar contagem, totais por status e amostras por cliente entre o Asaas e a base local antes de liberar o uso financeiro.
7. Configurar o webhook somente com token novo e executar uma reconciliação pós-carga para capturar alterações ocorridas durante o processo.

A referência oficial do Asaas confirma que `GET /v3/payments` é paginado e permite filtros por cliente, status, referência externa e intervalos de criação, vencimento e pagamento [2]. Isso permite fazer carga total e depois reconciliações incrementais por janela.

## 7. TecnoSpeed: delimitação correta

Não foi encontrada referência à TecnoSpeed no código atual da `main`. A documentação oficial consultada descreve a API de Pagamentos da TecnoSpeed como um fluxo de contas a pagar: cadastrar pagador/conta, solicitar pagamentos, gerar remessa, receber retorno e consultar a conciliação. Também há menção a notificações via webhook [3].

Portanto, a arquitetura deve separar os domínios:

| Domínio | Fonte | Tabela/fluxo recomendado |
|---|---|---|
| Cobranças dos clientes | Asaas | `bpo_charges`, `asaas_customers`, webhook e reconciliação |
| Despesas e saídas capturadas no Asaas | Asaas | `expense_records`, com origem e ID externo idempotente |
| Pagamentos bancários a fornecedores/beneficiários | TecnoSpeed, se contratado esse produto | Novo módulo de contas a pagar, remessa, retorno, status e auditoria |
| Operação do clube | Sistema próprio + backup seletivo | Cadastros, reservas, vistorias, abastecimentos e manutenção |

Nenhum pagamento TecnoSpeed deve ser implementado ou enviado antes de existir ambiente de homologação, definição de conta pagadora, banco, certificado, token, fluxo manual/automático, webhook e regra de aprovação interna.

## 8. Alternativas de recuperação

| Abordagem | Trade-offs | Custo | Complexidade de configuração |
|---|---|---:|---:|
| **A — Recomendada: base nova + carga Asaas + ETL seletivo do backup** | Preserva o código atual e usa o Asaas como verdade viva; exige validação de matching e uma etapa de transformação do legado | Infraestrutura nova + desenvolvimento controlado do importador | Média/alta |
| **B — Mais rápida: base nova + carga Asaas mínima; backup apenas para consulta e recadastro** | Coloca o financeiro no ar mais cedo; parte da operação histórica precisará ser recadastrada ou migrada depois | Menor esforço inicial | Baixa/média |
| **C — Staging legado isolado + extração assistida** | Permite explorar o backup antigo com segurança e recuperar o máximo de histórico; exige uma base intermediária e duas etapas | Infraestrutura temporária + ETL | Média |

A opção A oferece o melhor equilíbrio entre continuidade operacional, preservação histórica e segurança. A opção B é a alternativa leve se a prioridade absoluta for voltar a cobrar e consultar clientes rapidamente. A restauração direta do ZIP sobre produção está rejeitada por risco técnico e financeiro.

## 9. Plano de execução proposto

### Fase 1 — Reconexão e ambiente

Confirmar o repositório correto, provisionar um banco MySQL/TiDB novo, configurar a hospedagem e publicar a `main` sem alterar o código. As variáveis de segurança devem ser novas, com exceção das credenciais externas que o responsável confirmar: `JWT_SECRET`, `SETTINGS_ENCRYPTION_KEY`, `BACKUP_ENCRYPTION_KEY`, `DATABASE_URL`, `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, OAuth, SMTP e storage. A `BACKUP_ENCRYPTION_KEY` nova deve ser guardada em pelo menos dois locais fora da hospedagem.

### Fase 2 — Smoke test de produção

Acessar `/admin/diagnostico`, conferir o marcador `2026-08-17.2-conferencia-de-contas`, verificar que o banco foi reconhecido como novo e que as migrações atuais foram aplicadas. Confirmar login do administrador por `OWNER_OPEN_ID`, criação/consulta de cliente de teste e ausência de erro de runtime.

### Fase 3 — Carga financeira Asaas

Implementar ou adaptar um importador não destrutivo com dry-run, paginação completa, relatório de matching, upsert por ID Asaas, preservação de classificação manual e reconciliação dos totais. Primeiro executar contra sandbox ou contra uma cópia do banco; somente depois aplicar na base operacional. Não executar `run_reimport.mjs`.

### Fase 4 — Recuperação histórica seletiva

Carregar o dump antigo em staging isolado. Extrair primeiro cadastros e vínculos; depois reservas, embarcações, vistorias e abastecimentos. Para finanças legadas, produzir uma tabela de correspondência entre `subscription_charges`/`unclassified_charges` e `bpo_charges`, sem copiar `system_settings` nem substituir IDs de produção. Registros conflitantes ou sem cliente ficam em relatório de revisão.

### Fase 5 — Webhook e backup novo

Depois da base financeira validada, cadastrar novo token de webhook no Asaas, configurar a URL pública correta, testar um evento controlado e verificar a idempotência. Gerar um backup novo, conferir o artefato, testar restauração em staging e arquivar anexos. A chave nova deve ser mantida fora da hospedagem.

### Fase 6 — TecnoSpeed e operação expandida

Somente após o núcleo voltar ao ar, especificar e implementar a TecnoSpeed como fluxo independente de pagamentos a pagar, com homologação, aprovações, auditoria e reconciliação. A integração não deve ser misturada ao mecanismo de recebíveis do Asaas.

## 10. Informações necessárias para iniciar a execução

Para sair do diagnóstico e começar as alterações, preciso da confirmação de quatro pontos que mudam a arquitetura ou o risco:

1. Confirmar que o repositório correto é `Viniciusoluap/Exclusive-Club-Itz` e que devemos preservar a `main` atual como fonte oficial.
2. Escolher a alternativa A, B ou C. Minha recomendação é A; se a urgência for colocar o financeiro no ar, B é o caminho mais rápido.
3. Informar onde será provisionado o novo banco MySQL/TiDB e qual hospedagem deve ser reconectada ao GitHub. Não envie senhas, API keys ou tokens por mensagem.
4. Especificar qual produto da TecnoSpeed foi contratado e se a primeira etapa será pagamentos a pagar, DDA, extrato/conciliação ou outro módulo.

Após essa confirmação, a próxima alteração deve ser um importador em modo **dry-run**, mais testes e documentação. Nenhuma operação destrutiva será executada sem aprovação explícita e sem backup verificável da base correspondente.

## Referências externas

[1]: https://docs.asaas.com/docs/receive-asaas-events-at-your-webhook-endpoint "Asaas — Receive events from Asaas in your Webhook endpoint"

[2]: https://docs.asaas.com/reference/list-payments "Asaas — List payments"

[3]: https://docs.pagamentobancario.com.br/ "TecnoSpeed — API de Pagamento"
