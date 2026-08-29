# Pesquisa — Open Finance e agregação bancária

**Data da pesquisa:** 26/08/2026.

## Fonte oficial — Banco Central do Brasil

URL: https://www.bcb.gov.br/estabilidadefinanceira/openfinance

A página oficial do Banco Central define o Open Finance no Brasil dentro do ecossistema regulado e mantém links para normas, supervisão e participantes. Para o produto do Exclusive Club, a consequência prática é que o compartilhamento de dados bancários deve ocorrer por consentimento explícito do titular, em fluxo autenticado no banco, e não por captura de senha ou tela do internet banking.

A aplicação deve ser desenhada como consumidora de dados por meio de um provedor/participante habilitado ou de um agregador que opere com instituições participantes. O Exclusive Club não deve tentar se tornar participante regulado nem implementar diretamente a malha regulatória de APIs como primeira etapa.

## Implicação arquitetural preliminar

O MVP deve ser uma aplicação de **agregação de contas e conciliação financeira**: o usuário clica em “Conectar conta”, escolhe a instituição no widget seguro do provedor, autoriza o compartilhamento no ambiente do banco e retorna ao sistema. O backend armazena apenas tokens/referências criptografadas, consentimentos e dados financeiros necessários; nunca armazena senha bancária.

## Pluggy — evidências oficiais

Fonte de criação de Item: https://docs.pluggy.ai/docs/creating-an-item

A Pluggy documenta duas formas de conexão: pelo Pluggy Connect (widget) ou diretamente pela API. Para Open Finance regulado, o fluxo usa um conector de Open Finance, criação de um Item e autorização via fluxo OAuth v2. O usuário informa CPF ou CNPJ conforme o tipo de conexão, recebe uma URL temporária para abrir a página de login da instituição e, depois da autorização, os dados do Item podem ser consultados. A URL expira após alguns minutos e o fluxo de autorização tem janela limitada, portanto o frontend deve tratar retorno, expiração e reconexão.

Fonte de sandbox: https://docs.pluggy.ai/docs/sandbox

A Pluggy oferece sandbox com dados sintéticos, fluxos de teste e cenários de conexão; itens de sandbox não atualizados por mais de 30 dias podem ser excluídos. A documentação mostra estrutura de dados semelhante à produção para contas, transações, investimentos e empréstimos. Isso permite construir e testar o MVP sem conectar contas reais.

Implicação: a Pluggy atende diretamente ao requisito de “Conectar conta” por um widget/fluxo hospedado e evita que o Exclusive Club manipule credenciais bancárias. Ainda será necessário confirmar cobertura das instituições desejadas, plano comercial, limites e tratamento de consentimento para pessoa física e jurídica.

## Belvo — evidências oficiais

Fonte do widget: https://developers.belvo.com/products/aggregation_brazil/aggregation-brazil-integration-widget

A Belvo documenta um Hosted Widget para extrair dados bancários do Open Finance no Brasil. O backend gera um access token de curta duração com escopos, recursos desejados, finalidade de uso, URLs de callback, termos e condições, permissões e identificação do usuário. Para pessoa física o fluxo usa CPF e nome; para empresa, a documentação pede informações de CPF e CNPJ adequadas ao consentimento. O widget retorna o usuário ao sistema em callbacks de sucesso, saída ou erro.

Os recursos recomendados pela documentação incluem `ACCOUNTS`, `TRANSACTIONS`, `OWNERS`, `BILLS`, `INVESTMENTS` e `INVESTMENT_TRANSACTIONS`. A coleta é assíncrona: após o link ser criado, a Belvo recupera os dados e envia eventos quando os recursos terminam, inclusive um evento de conclusão do progresso histórico.

Fonte de webhooks: https://developers.belvo.com/developer_resources/resources-webhooks-aggregation

A Belvo exige webhooks para aproveitar o fluxo assíncrono. A documentação descreve eventos de atualização histórica, novas contas e novas faturas, além de erros de recurso e limites operacionais mensais do Open Finance. O endpoint pode receber autorização adicional. A aplicação deve responder de modo idempotente, registrar o evento e buscar os recursos na API; não deve depender apenas da resposta síncrona da criação do link.

Implicação: Belvo também atende ao requisito de conexão simples via widget, com forte aderência ao fluxo regulado. A diferença prática para a Pluggy dependerá de cobertura institucional, preço, limites mensais, recursos contratados e qualidade do suporte para o perfil CPF/CNPJ do Exclusive Club.

## Modelo comercial observado

Na página oficial de preços da Belvo, https://belvo.com/plans-and-pricing/, o sandbox é descrito como gratuito para testes e avaliação, enquanto o acesso de produção para atender usuários reais exige plano pago. A página apresenta o plano Launch a partir de **US$ 1.000/mês** e um plano Growth sob medida. O preço deve ser tratado como referência pública de 26/08/2026 e confirmado comercialmente antes da decisão.

## Pluggy — cobertura e limites

Fonte de cobertura: https://docs.pluggy.ai/docs/open-finance-institutions-coverage

A tabela oficial da Pluggy lista instituições, contexto pessoal/empresarial/investimentos e produtos expostos. A página consultada mostra cobertura de contas e transações para diversas instituições, incluindo Banco do Brasil, Bradesco, C6, Caixa, BTG, Banco Bmg, Banco BRB, Banco Sofisa e outras. A cobertura deve ser conferida para cada banco prioritário e para o contexto CPF/CNPJ antes da contratação; não é tecnicamente correto prometer “qualquer conta” sem essa validação.

Fonte de limites: https://docs.pluggy.ai/docs/rate-limits-of

A rede Open Finance brasileira impõe limites mensais por combinação de CPF/CNPJ, instituição e produto. Para contas, a documentação informa, entre outros limites, 4 recuperações mensais de lista/detalhes, 420 de saldo, 240 de transações recentes e 4 de transações não recentes; a própria Pluggy gerencia a rotina de atualizações, desde que não sejam criados múltiplos Items para a mesma combinação. O sistema deve manter um único vínculo ativo por usuário/instituição, desativar vínculos abandonados e não fazer polling agressivo.

Implicação: a sincronização do MVP será orientada a webhooks/atualizações do provedor, com reconciliação sob demanda e controle de limites, e não por consultas a cada abertura de tela.

## Pluggy — posicionamento oficial

Fonte: https://www.pluggy.ai/

A página oficial da Pluggy afirma conexão com mais de 130 instituições financeiras em uma única API, apresenta conectores de dados para saldos, extratos, cartões, investimentos e identidade, menciona webhooks em vez de polling e informa que a empresa é regulada pelo Banco Central como ITP. A página também oferece teste em sandbox e encaminha planos/preços para contratação.

O site mostra um widget com escolha de contexto “Pessoal” e “Empresas”, e exemplos de instituições como Itaú, Nubank, Bradesco, Santander, Inter e Caixa. A cobertura exata deve continuar sendo validada pela tabela da documentação para cada conta que o usuário pretende conectar.

## Celcoin — alternativa avaliada

Fonte: https://www.celcoin.com.br/open-finance/financial-data/

A Celcoin apresenta o produto Financial Data para acesso a dados bancários de clientes PF e PJ via Open Finance, com consentimento, saldos, extratos, transações, padronização para múltiplos bancos, integração via API e relatórios/logs. A página encaminha a contratação e a documentação técnica para contato comercial; não encontrei preço público na página consultada.

Avaliação preliminar: é uma alternativa válida para uma operação mais enterprise ou que queira combinar dados, pagamentos e infraestrutura bancária da Celcoin, mas tende a exigir negociação e onboarding comercial maior do que um MVP baseado em widget de Pluggy ou Belvo.

## Open Finance Brasil — onboarding oficial

Fonte: https://openfinancebrasil.org.br/onboarding/

O material oficial explica que a participação direta exige autorização para funcionamento pelo Banco Central, cadastro no Diretório de Participantes, requisitos de segurança e UX, certificação/homologação e publicação das APIs/aplicações. Para o Exclusive Club, isso reforça a decisão de começar por um provedor habilitado/agregador, em vez de tentar operar como participante direto.

A jornada do usuário deve preservar segurança e privacidade, agilidade, transparência e controle. Portanto, a tela do sistema deve deixar clara a finalidade, os dados solicitados, o prazo do consentimento, a instituição conectada, a possibilidade de revogar e o estado da sincronização.

## Pluggy — preços públicos consultados

Fonte: https://www.pluggy.ai/precos

A página oficial consultada em 26/08/2026 informa, como valores iniciais, **Dados a partir de R$ 2.500/mês** e **Pagamentos a partir de R$ 500/mês**, ambos com teste grátis de 14 dias. O plano de Dados é apresentado para conectar e ler dados de bancos do Brasil e inclui contas reais de clientes, Open Finance/acesso direto, webhooks e enriquecimento; a página também informa que o teste de 14 dias pode ser usado em produção sem cartão, sujeito às condições do provedor.

Implicação econômica: para um sistema próprio com múltiplos usuários, Pluggy parece mais transparente e rápida para validar tecnicamente; o custo de dados é relevante e deve entrar na conta de recorrência. Belvo apresenta preço inicial público mais alto na página consultada (US$ 1.000/mês). Celcoin não apresentou preço público na página analisada.

## Pluggy — webhooks e ciclo de vida

Fonte: https://docs.pluggy.ai/docs/webhooks

A Pluggy documenta eventos `item/created`, `item/updated`, `item/deleted`, `item/error`, `item/waiting_user_input`, `item/login_succeeded`, além de eventos de transações criadas, atualizadas e excluídas. O provedor informa que uma notificação pode ser reenviada até 9 vezes em caso de falha e exige resposta 2XX em até 5 segundos; o processamento deve ocorrer depois da resposta. Para eventos de Item, a recomendação é consultar `GET /items/{id}` para obter o estado mais recente, em vez de confiar apenas no payload recebido.

Implicação: o backend do Exclusive Club deve ter um endpoint HTTPS rápido, validar um segredo enviado em header, gravar uma chave idempotente do evento, responder 2XX e enfileirar/processar a sincronização em seguida. O status da conexão e do consentimento precisa ser visível ao usuário, com tratamento para erro, espera de autorização, conexão offline e reconexão.

## Pluggy — autenticação

Fonte: https://docs.pluggy.ai/reference/auth

A documentação divide o acesso em dois tokens: API Key de backend, com validade indicada de 2 horas e capacidade de ler dados, criar Connect Tokens, configurar webhooks e gerenciar Items; e Connect Token, com validade de 30 minutos, destinado ao frontend/Connect Widget e sem permissão para recuperar dados. As credenciais permanentes do cliente devem permanecer somente no backend.

Implicação: o Exclusive Club terá variáveis privadas `PLUGGY_CLIENT_ID`/`PLUGGY_CLIENT_SECRET` ou equivalente conforme o painel, nunca expostas no bundle do navegador. O frontend receberá apenas um Connect Token efêmero criado para o usuário autenticado e o backend persistirá o `item_id`/consentimento de forma vinculada ao cliente.

## Pluggy — Connect Widget

Fonte: https://docs.pluggy.ai/docs/setup-pluggyconnect-widget-on-your-app

O guia oficial exige que o backend crie e entregue o Connect Token; a chamada de criação requer uma API Key e as credenciais `CLIENT_ID`/`CLIENT_SECRET`, portanto não deve ser feita no navegador. O frontend usa o token efêmero para abrir o widget e o backend acompanha o Item criado/atualizado.

Implicação: a primeira entrega pode ser implementada dentro do repositório atual como uma área de Open Finance com botão “Conectar conta”, endpoint autenticado para token, registro do Item por cliente e endpoint de webhook. O recurso ficará inerte até que as credenciais Pluggy de sandbox sejam configuradas no ambiente.

## Pluggy — Connect Token: contrato confirmado

Fonte: https://docs.pluggy.ai/reference/connect-token-create

O endpoint é `POST https://api.pluggy.ai/connect_token`, autenticado com `X-API-KEY`. O payload pode conter `itemId` para atualizar um vínculo existente e `options` com `clientUserId`, `webhookUrl`, `oauthRedirectUri` e `avoidDuplicates`. Para o Exclusive Club, o backend deve enviar um `clientUserId` estável vinculado ao usuário e `avoidDuplicates: true`, sem enviar dados bancários ao frontend. O endpoint retorna um Connect Token limitado para o widget; esse token não pode recuperar dados.

## Pluggy — contas e transações

Fontes: https://docs.pluggy.ai/reference/accounts-list e https://docs.pluggy.ai/reference/transactions-list-by-cursor

A listagem de contas usa `GET https://api.pluggy.ai/accounts` com `itemId` obrigatório e retorna as contas coletadas para o Item. A listagem atual de transações usa `GET https://api.pluggy.ai/v2/transactions` com `accountId` obrigatório e paginação por cursor `after`; filtros oficiais incluem `dateFrom`, `dateTo` e `createdAtFrom`. A documentação recomenda copiar as transações para o sistema da aplicação e usar o endpoint uma vez por sincronização, em conjunto com webhooks de criadas/atualizadas/excluídas.

Implicação: o adaptador deve persistir `providerAccountId`, `providerTransactionId`, `date`, `amount`, `type`, `description`, `merchant` e o cursor/última sincronização, com upsert por ID externo e sem substituir histórico local de forma cega.

## Pluggy — introdução do widget

Fonte: https://docs.pluggy.ai/docs/pluggy-connect-introduction

A Pluggy descreve o Connect como um widget drop-in que trata validação de credenciais, MFA, erros e casos específicos das instituições. O widget funciona em navegadores e aplicações web, o que permite integrar a experiência ao painel administrativo do Exclusive Club sem criar uma tela própria de login bancário.

## Pluggy — webhooks e widget: regras de produção

Fonte: https://docs.pluggy.ai/docs/webhooks

Os eventos trazem `event`, `eventId`, `clientUserId`, `triggeredBy` e o identificador da entidade. A Pluggy informa que o endpoint deve responder 2XX em menos de 5 segundos e que o processamento deve ocorrer depois da resposta; podem existir até nove tentativas de entrega. Para eventos de Item, a aplicação deve buscar `GET /items/{id}` e usar o estado mais recente. O endpoint de webhook pode receber headers customizados configurados via API, permitindo proteger a URL com segredo próprio.

O widget é inicializado no frontend com um Connect Token obtido por endpoint backend; o quickstart oficial possui exemplos React e não recomenda colocar `CLIENT_ID`/`CLIENT_SECRET` no frontend. Nesta primeira entrega, o sistema será provider-first (Pluggy) e provider-agnostic na camada de domínio, deixando Belvo/Celcoin como adapters futuros.

## Pluggy — autenticação e Item

Fontes: https://docs.pluggy.ai/reference/auth-create e https://docs.pluggy.ai/reference/items-retrieve

O endpoint `POST /auth` recebe JSON com `clientId` e `clientSecret`, retornando `apiKey`; a API usa `X-API-KEY` nas chamadas seguintes. O Item recuperado possui `status`, `executionStatus`, `connector.name`, `clientUserId`, `lastUpdatedAt` e `consentExpiresAt`. A implementação usa o estado do Item para atualizar o vínculo local, enquanto o adapter deve ser refinado para considerar tanto status quanto executionStatus em futuras validações de produção.
