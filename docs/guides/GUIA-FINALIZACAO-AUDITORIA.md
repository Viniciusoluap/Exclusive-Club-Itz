# Guia para finalizar a auditoria — passo a passo

**Para quem é este guia:** para você, dono do sistema. Não presume nenhum
conhecimento técnico. Cada passo diz **o que clicar**, **o que você deve ver** e
**o que fazer se aparecer outra coisa**.

**Por que ele existe:** a auditoria chegou num ponto em que o que falta não é
código — é (a) apertar botões que só rodam no sistema real, (b) olhar telas que
eu não consigo enxergar, e (c) tomar duas decisões que são suas, não minhas.

**Quanto tempo leva:** as Partes 1 a 5 levam cerca de 30 minutos, tudo no mesmo
dia. As Partes 6 e 7 você faz quando puder.

---

## Índice

| Parte | O que é | Quem faz | Tempo |
|---|---|---|---|
| 1 | Publicar o código novo | Você | 5 min |
| 2 | Confirmar que o código novo subiu | Você | 2 min |
| 3 | Conferir as migrações do banco | Você | 3 min |
| 4 | Guardar a chave do backup em lugar seguro | Você | 10 min |
| 5 | Apertar três botões (na ordem) | Você | 10 min |
| 6 | Tirar prints para eu terminar 4 stories | Você → eu | quando puder |
| 7 | Uma decisão de risco que só você pode tomar | Você | 5 min de leitura |
| 8 | O que nunca deve ser mexido | — | leitura |
| 9 | Como me reportar quando algo der errado | Você | — |

---

## Parte 1 — Publicar o código novo

### O que está acontecendo

Todo o trabalho que eu fiz está guardado no GitHub. **Guardado não é o mesmo que
no ar.** A hospedagem (Manus) só passa a rodar o código novo quando alguém manda
publicar. Enquanto isso não acontece, o sistema continua rodando o código
antigo — e nenhuma correção que eu fiz existe para quem usa o site.

Isso não é um defeito: é como o Manus funciona. Só que ninguém pode fazer isso
no seu lugar, porque eu não tenho acesso ao painel dele.

### Passo a passo

1. Abra o painel do **Manus** e entre no projeto do clube.
2. Procure o botão de **sincronizar** (às vezes aparece como "Sync", "Puxar do
   GitHub" ou "Atualizar do repositório"). Clique nele.
   - Isso faz o Manus **buscar** o código novo. Ainda não coloca no ar.
3. Espere terminar. Costuma levar 1 ou 2 minutos.
4. Agora clique em **publicar** (às vezes "Publish", "Deploy" ou "Publicar").
   - Isso é o que efetivamente coloca o código novo no ar.
5. Espere a publicação terminar. Costuma levar de 2 a 5 minutos.

> **Se você não achar os botões:** tire um print da tela inteira do painel do
> Manus e me mande. Eu te digo exatamente onde clicar. Não fique tentando
> adivinhar — clicar no botão errado num painel de hospedagem pode derrubar o
> site.

---

## Parte 2 — Confirmar que o código novo realmente subiu

### O que está acontecendo

Este é o passo mais importante do guia inteiro, e o mais fácil de pular.

Durante a auditoria, nós perdemos **várias rodadas** de investigação procurando
defeito em código que nem tinha chegado em produção. A correção estava certa. O
que estava errado era a suposição de que ela estava no ar.

Para acabar com essa dúvida para sempre, eu coloquei no sistema um **marcador de
versão**: um texto que muda a cada entrega. Se o marcador na tela for o que eu
te disse que seria, o código novo subiu. Se for outro, não subiu — e não adianta
procurar defeito em lugar nenhum.

### Passo a passo

1. Entre no sistema como **administrador**.
2. Vá em **Configurações**.
3. Clique em **Diagnóstico do Sistema**.
   - (Se preferir, digite direto na barra de endereço: `/admin/diagnostico`)
4. Olhe o primeiro cartão, **"Versão em execução"**.
5. No campo **"Marcador de build"**, você deve ver exatamente:

```
2026-08-12.1-backup-restauravel
```

### O que fazer conforme o que aparecer

| O que aparece | O que significa | O que fazer |
|---|---|---|
| Exatamente o texto acima | ✅ Subiu. Pode seguir. | Vá para a Parte 3. |
| Um texto **diferente** | A publicação não pegou o código novo | Repita a Parte 1. Se repetir e continuar diferente, me mande um print. |
| A tela não abre / dá erro | O servidor pode não ter subido | Me mande um print do erro **e** um print da tela de logs do Manus. |

> **Guarde este hábito.** Toda vez que eu te entregar alguma coisa, eu vou te
> dizer o marcador novo. Confira ele antes de testar qualquer outra coisa. Esse
> único passo economiza horas.

---

## Parte 3 — Conferir as migrações do banco

### O que está acontecendo

Explicando sem jargão: o **banco de dados** é o arquivo gigante onde ficam
guardados os clientes, as reservas, as cobranças — tudo. De vez em quando o
código novo precisa de uma "gaveta nova" nesse arquivo (uma coluna nova, uma
tabela nova). O nome técnico de "criar essa gaveta" é **migração**.

O problema que descobrimos: **o Manus publica o código, mas nunca criava as
gavetas.** O código novo subia esperando uma gaveta que não existia, e a
funcionalidade quebrava. Duas funcionalidades quebraram exatamente por isso
antes de a gente entender a causa.

A correção: agora o próprio servidor cria as gavetas que faltam quando liga.

### Por que isso merece atenção especial

Esta é a única parte do sistema onde um programa mexe **sozinho** na estrutura do
seu banco de produção. Eu tomei o cuidado mais importante possível: como o seu
banco já existe e já tem dados, o servidor **marca as gavetas existentes como já
prontas em vez de tentar criá-las de novo**. Ele não apaga nada, não recria nada,
não toca nos dados. Isso está coberto por 10 testes automáticos que rodam contra
um banco de verdade, incluindo um teste que insere uma linha real e confirma que
ela continua lá depois.

Mesmo assim: você olhar na primeira vez é barato e a tranquilidade vale.

### Passo a passo

1. Ainda na tela **Diagnóstico do Sistema** (Parte 2).
2. Role até o cartão **"Migrações do banco"**.
3. Leia a frase que aparece nele.

### O que fazer conforme o que aparecer

| Frase no cartão | O que significa | O que fazer |
|---|---|---|
| "Banco existente adotado: as migrações atuais foram marcadas como aplicadas, sem executar DDL sobre os dados." | ✅ O esperado na primeira vez. Nada foi mexido nos seus dados. | Seguir. |
| "Banco sob controle de migrações." | ✅ Normal nas vezes seguintes. | Seguir. |
| "Banco novo: todas as migrações foram aplicadas." | ⚠️ Isso **não** deveria aparecer no seu banco, que tem dados. | **Pare** e me mande um print imediatamente. |
| "Não foi possível verificar as migrações." + texto em vermelho | O sistema está funcionando, mas alguma gaveta pode não ter sido criada | Me mande um print do texto vermelho inteiro. Não é urgente — o site continua no ar. |

---

## Parte 4 — Guardar a chave do backup em lugar seguro

### O que está acontecendo

Seus backups são **criptografados**. Isso é bom: se o arquivo do backup vazar,
quem pegar não consegue ler nada — nem dados de cliente, nem cobrança, nada.

O que abre o backup é uma senha longa chamada `BACKUP_ENCRYPTION_KEY`, que hoje
está guardada **dentro do Manus**.

E aqui está o risco que ninguém pensa até acontecer:

> **Se você perder o acesso ao Manus, você perde a chave. Sem a chave, TODOS os
> seus backups viram arquivos ilegíveis. Para sempre. Não existe recuperação,
> não existe suporte que resolva, não existe "esqueci minha senha".**

Ou seja: hoje, backup e chave moram no mesmo lugar. Um problema no Manus leva os
dois juntos. É como guardar a chave do cofre dentro do cofre.

### Passo a passo

1. No painel do **Manus**, entre na área de **variáveis de ambiente** (pode
   aparecer como "Environment Variables", "Env", "Secrets" ou "Configurações do
   ambiente").
2. Procure a variável chamada `BACKUP_ENCRYPTION_KEY`.
3. Clique para **revelar** o valor dela (normalmente vem escondido com bolinhas).
4. **Copie o valor inteiro.** É um texto longo, sem espaços. Copie do primeiro ao
   último caractere.
5. Guarde esse texto em **pelo menos dois** lugares fora do Manus. Sugestões, da
   melhor para a pior:
   - Um gerenciador de senhas (Bitwarden, 1Password, o gerenciador do Google).
   - Um papel guardado em lugar físico seguro (sim, papel funciona muito bem
     para isso — não pode ser invadido por internet).
   - Um documento em nuvem que **só você** acesse.
6. Ao lado do valor, anote também: *"Chave dos backups do sistema do clube.
   Sem ela nenhum backup pode ser aberto. Nunca alterar."*

### Cuidados

- ❌ **Não me mande essa chave.** Nem para mim, nem em e-mail, nem em mensagem.
  Eu não preciso dela e não devo tê-la.
- ❌ **Não altere o valor dela no Manus.** Trocar a chave torna todos os backups
  já existentes ilegíveis na hora.
- ✅ Se algum dia você trocar de hospedagem, essa chave tem que ir junto.

---

## Parte 5 — Apertar três botões (na ordem)

Três coisas que só rodam no sistema real, com os seus dados. Faça **nesta
ordem** — o motivo da ordem está explicado em cada uma.

> ### ⚠️ Antes do 5.1: rode um backup novo
>
> **Todo backup gerado antes de 12/08/2026 não restaura.** O banco tem uma view
> legada (`financial_charges`) que o exportador tratava como se fosse tabela; o
> resultado era a palavra `undefined` escrita dentro do arquivo, no lugar da
> estrutura dela. O backup terminava marcado como "Sucesso", com tamanho e data
> — mas `undefined;` é erro de sintaxe, e a restauração abortava naquela linha,
> sem trazer nada do que vinha depois.
>
> Corrigido em 12/08/2026 (marcador `2026-08-12.1-backup-restauravel`), com
> teste que restaura um banco de verdade a cada execução do CI.
>
> **O que fazer:** depois de publicar, clique em **"Executar Backup Agora"** e
> só então siga para o 5.1. O primeiro backup válido do sistema é esse.

### 5.1 — Botão "Conferir agora" (o mais importante)

**Onde:** Menu do administrador → **Backups** → cartão **"Conferência do
backup"** → botão **"Conferir agora"**.

**O que ele faz:** abre o último backup gerado e compara com o banco atual,
tabela por tabela. Ele **não restaura nada e não altera nada** — é só uma
conferência de leitura. É a diferença entre "o arquivo de backup existe" e "o
arquivo de backup realmente serve".

**Por que é o primeiro:** de nada adianta fazer os outros dois passos se o
backup não estiver bom. Este é o passo que responde à sua pergunta — *"meu
backup está seguro?"* — com evidência em vez de opinião.

**O que você deve ver:**

| Resultado | Significado | O que fazer |
|---|---|---|
| Faixa **verde**: "Todas as tabelas do banco estão no backup." | ✅ Backup íntegro. | Seguir para 5.2. |
| Faixa **vermelha**: "N tabela(s) com problema." | Alguma tabela ficou de fora ou veio vazia | **Pare aqui.** Me mande um print da faixa vermelha inteira, com a lista de tabelas. Não faça os outros passos. |

> Se der vermelho, não entre em pânico: nada foi perdido. Significa que o backup
> daquele momento está incompleto e precisa ser refeito — e é exatamente para
> descobrir isso **antes** de precisar dele que este botão existe.

---

### 5.2 — Botão "Arquivar anexos"

**Onde:** Menu do administrador → **Backups** → botão **"Arquivar anexos"** (no
topo da página, ao lado de "Executar Backup Agora").

**O que ele faz:** as fotos das vistorias e os documentos dos clientes não ficam
dentro do backup do banco (são grandes demais — colocar tudo junto derrubava o
backup inteiro). Eles são copiados **separadamente, em lotes**. Este botão manda
o sistema processar mais um lote.

**O que você deve ver:** o botão mostra um contador do tipo `(238/238)`. Quando
os dois números forem iguais, acabou — todos os anexos estão arquivados.

**Se os números forem diferentes** (ex.: `120/238`): aperte o botão de novo,
espere terminar, aperte de novo. Cada clique processa mais um lote. É normal
precisar de vários cliques. O sistema também faz isso sozinho toda semana, aos
domingos — o botão só serve para adiantar.

> **Por que em lotes e não tudo de uma vez:** o servidor tem um tempo limite por
> operação. Tentar processar 238 arquivos de uma vez estourava esse limite e
> falhava tudo. Em lotes, cada pedaço termina dentro do tempo e o progresso
> nunca é perdido.

---

### 5.3 — Botão "Migrar parciais"

**Onde:** Menu do administrador → **SaaS** (`/admin/saas`) → aba de
**Cobranças** → botão laranja **"Migrar parciais (N)"**, onde N é um número.

> **Se o botão não aparecer, é porque não há nada para migrar.** Ele só existe
> na tela quando existem cobranças no estado antigo. Nesse caso, pule este passo.

**O problema que ele resolve, em linguagem de dono do negócio:**

Imagine uma mensalidade de R$ 1.000 e o cliente pagou R$ 400. No jeito antigo, o
sistema deixava essa cobrança marcada como "parcialmente paga" — e aí ela
contava **os R$ 1.000 inteiros** no "Total Cobrado" **e mais R$ 600** de saldo
devedor. O mesmo dinheiro contado duas vezes. Seu faturamento aparecia inflado.

O jeito novo: a cobrança é liquidada pelos R$ 400 que realmente entraram, e uma
cobrança nova de R$ 600 é criada como saldo devedor. Aí a conta fecha:

```
Total Cobrado  =  Recebido  +  Saldo devedor
```

Este botão aplica a regra nova nas cobranças antigas que ficaram no jeito velho.

**Passo a passo:**

1. Clique em **"Migrar parciais (N)"**.
2. Aparece uma **prévia**: quantas cobranças, valor original, valor recebido e
   saldo devedor. **Nada foi alterado ainda.**
3. **Confira se os números batem com o que você sabe do seu financeiro.** Você
   conhece esses valores melhor do que qualquer sistema.
4. Se estiver certo, confirme.
5. Se algo parecer estranho, **não confirme** — me mande um print da prévia.

**Depois de confirmar:** confira os cartões de totais no topo da tela. "Total
Cobrado" deve bater com "Recebido + Saldo devedor". Se não bater, me mande um
print dos quatro cartões.

> Se alguma cobrança falhar na migração, as outras continuam normalmente e o
> sistema te diz qual falhou. Ele não para no meio deixando metade do financeiro
> de um jeito e metade de outro.

---

## Parte 6 — O que eu preciso de você para terminar 4 stories

Estas quatro eu **não terminei de propósito**. Não é falta de tempo nem de
capacidade: é que o critério para saber se ficaram certas é **visual**, e eu não
enxergo a tela do sistema. Terminar às cegas seria trocar um problema conhecido
por um desconhecido — e em alguns casos, num documento que vai para o seu
cliente.

Para cada uma, eu digo **exatamente o que me mandar**. Pode ser aos poucos.

---

### Story 30 — Unificar a geração de PDF

**O que é:** o sistema gera PDFs em 5 lugares diferentes usando 2 programas
diferentes de gerar PDF. Isso significa que os documentos não são visualmente
parecidos entre si, e uma correção de layout precisa ser feita em 5 lugares.

**Por que eu parei:** unificar significa reescrever como cada documento é
desenhado. Se eu fizer isso sem ver como eles são hoje, o resultado provável é
um PDF que abre, não dá erro nenhum, e está **feio ou errado** — e você só
descobre quando um cliente reclamar. Esse é o pior tipo de defeito: silencioso.

**O que eu preciso — 5 PDFs, gerados de verdade pelo sistema:**

| # | Documento | Como gerar |
|---|---|---|
| 1 | **Relatório do cliente** | Tela **Admin** (`/admin`) → escolha um cliente → gerar relatório |
| 2 | **Relatório de abastecimento** | Tela **Abastecimento** → marque um ou mais registros → botão **"Relatório PDF"** |
| 3 | **Relatório de vistorias** | Tela **Vistorias** → marque uma ou mais vistorias → gerar relatório |
| 4 | **PDF de cobranças (BPO)** | `/admin/saas` → aba Cobranças → botão **"Gerar PDF"** |
| 5 | **Contrato e/ou notificação** | Onde você emite contrato ou notificação para o cliente |

> Os itens 1, 2 e 5 são desenhados por um programa (PDFKit); os itens 3 e 4, por
> outro (jsPDF). É essa divisão que faz os documentos terem caras diferentes.

**Como me mandar:** o arquivo PDF mesmo, não print. Se algum tiver dado de
cliente real que você prefira não compartilhar, gere para um cliente de teste ou
tampe os dados — o que eu preciso é o **layout**, não o conteúdo.

**E me responda estas três perguntas** (são elas que decidem o trabalho):

1. **Algum desses PDFs vai para o cliente final?** Quais?
2. **Algum deles está com problema visual hoje** (texto cortado, foto fora do
   lugar, coluna espremida, acento errado)? Qual e onde?
3. **Você quer que todos fiquem com a mesma cara** (mesmo cabeçalho, mesma
   fonte, mesmo logo)? Ou cada um pode ter o formato que já tem?

> Se a resposta da 3 for "cada um pode ficar como está" e a da 2 for "nenhum tem
> problema", eu recomendo **arquivar esta story**. Ela seria 32 a 48 horas de
> trabalho para arrumar uma coisa que só incomoda quem mexe no código — e o
> risco de estragar um documento que vai para cliente é real. Dinheiro melhor
> gasto em outro lugar. A decisão é sua; eu só quero que ela seja informada.

---

### Story 27 — Cores e estilos padronizados

**O que é:** algumas telas têm cores escritas "na mão" no código, em vez de usar
a paleta oficial do sistema. Consequência prática: se você um dia quiser mudar a
cor principal do sistema, essas telas vão continuar com a cor velha.

**O que eu preciso:**

1. Prints das telas que hoje **parecem fora do padrão** para você — cor
   diferente, botão de tom estranho, caixa de diálogo que destoa.
2. Resposta a: **você pretende mudar as cores do sistema algum dia?** Se a
   resposta for "não", esta story pode ser arquivada sem prejuízo nenhum.

---

### Story 28 — Telas vazias padronizadas

**O que é:** quando uma lista não tem nada para mostrar (nenhuma reserva,
nenhuma cobrança), cada tela mostra isso de um jeito diferente. Umas mostram
uma frase, outras mostram só um espaço em branco.

O caso que importa de verdade: **um espaço em branco não distingue "não tem
nada" de "deu erro ao carregar".** Você olha, acha que não tem cobrança nenhuma,
e na verdade a consulta falhou.

**O que eu preciso:** prints das telas onde você já viu **espaço em branco sem
explicação nenhuma**. Se lembrar de alguma em que você ficou na dúvida se estava
vazio ou quebrado, essa é a mais importante de todas.

---

### Story 24 — Testes automáticos dos 4 fluxos principais

**O que é:** um robô que, todo dia, abre o sistema sozinho e faz o caminho
completo de um usuário: pagar com PIX, fazer uma reserva, fazer uma vistoria com
foto, registrar um abastecimento. Se algum passo quebrar, ele avisa **antes** de
o cliente descobrir.

**Por que eu não fiz:** o robô precisa de um lugar para praticar. Se ele rodar no
sistema de verdade, ele vai criar reservas de verdade, cobranças de verdade e
cobranças de PIX de verdade na sua conta Asaas. Isso é inaceitável.

**O que eu preciso de você — responda o que souber:**

1. **Existe um ambiente de teste do sistema** (uma cópia separada, com banco
   separado)? Ou só existe o de produção?
2. **Sua conta Asaas tem "sandbox"** (modo de teste)? Se tiver, dá para me
   passar o acesso do sandbox — **nunca** o da conta real?
3. Se não existir nem um nem outro: **você topa criar um ambiente de teste?** É
   um custo mensal a mais na hospedagem, e é o que torna esta story possível.

> Sem pelo menos um "sim" aí, esta story fica bloqueada por falta de ambiente —
> não por falta de trabalho. É honesto deixá-la parada.

---

## Parte 7 — A decisão de risco que é sua

### O que está em jogo

Seis melhorias (as stories 33, 34, 35, 36, 38 e 39) mexem na **estrutura das
tabelas do banco**, não só no código. São coisas como padronizar como o dinheiro
é guardado, padronizar como as datas são guardadas, e reorganizar uma tabela de
abastecimento que tem 40 colunas.

**O lado bom:** são melhorias reais. Reduzem a chance de erro de centavo em
relatório, de data aparecer com um dia de diferença, e deixam o sistema mais
fácil de evoluir.

**O lado ruim, dito sem enfeite:** mexer na estrutura de uma tabela que já tem
dados é a operação mais arriscada que existe num sistema. Se der errado no meio,
os dados podem ficar num estado misturado. É o tipo de coisa que se faz com
backup na mão e horário combinado.

**O que mudou a favor:** antes desta auditoria, essas mudanças nem eram viáveis,
porque as migrações não chegavam ao banco (Parte 3). Agora chegam. E agora
existe o botão de conferência de backup (Parte 5.1), que te deixa provar que o
backup presta **antes** de mexer.

### As três opções

| Opção | O que acontece | Para quem |
|---|---|---|
| **A — Não fazer** | Fica tudo como está. Nenhum risco novo. As melhorias não acontecem. | Se o sistema está te atendendo e você não viu erro de valor nem de data. **É uma escolha legítima, não covardia.** |
| **B — Fazer uma por vez, começando pela menor** | Eu faço a story 36 (validações simples, a de menor risco), você acompanha, e só depois decidimos a próxima. | **É a minha recomendação.** Você vê como é o processo com risco baixo antes de autorizar as grandes. |
| **C — Fazer todas numa janela combinada** | Marcamos um horário de baixo movimento, backup conferido na hora, faço todas em sequência. | Se você quiser resolver de uma vez e tem um horário em que o clube não usa o sistema. |

### O que eu preciso que você responda

1. **A, B ou C?**
2. Se for B ou C: **qual dia e horário o sistema pode ficar instável por ~1
   hora?** (madrugada, segunda de manhã, o que for o mais parado para vocês)
3. **Você já viu, na prática, algum erro de centavo em relatório ou alguma data
   aparecendo com um dia de diferença?** Se sim, me conte qual tela — isso muda
   a prioridade completamente, porque deixa de ser melhoria preventiva e passa a
   ser correção de defeito real.

---

## Parte 8 — O que nunca deve ser mexido

Lista curta, para você ter na mão se um dia outra pessoa mexer no sistema.

| Item | Por quê |
|---|---|
| `BACKUP_ENCRYPTION_KEY` | Mudou ou perdeu = todos os backups ficam ilegíveis. Sem recuperação. |
| A função de saldo do orçamento de combustível (`calculateMonthFinalBalance`) | Determinação sua. A lógica de arrastar saldo de mês para mês é essencial para a continuidade das informações. |
| A senha do e-mail (SMTP) | Determinação sua. Mantida como está. |

E uma observação operacional que vale registrar: **o deploy é manual.** O código
só vai para o ar quando alguém sincroniza e publica no Manus (Parte 1). Se um
dia parecer que "a correção não funcionou", **antes de tudo confira o marcador
de build** (Parte 2). Na maioria das vezes a correção estava certa e só não
tinha subido.

---

## Parte 9 — Como me reportar quando algo der errado

Um relato bom economiza dias. Um relato incompleto vira adivinhação — e
adivinhação, num sistema que mexe com dinheiro, é caro.

**Sempre me mande estas quatro coisas:**

1. **O marcador de build** que está na tela de Diagnóstico naquele momento.
   *(Sem isso, eu não sei nem qual versão do sistema você está usando.)*
2. **Print da tela inteira**, não só do pedaço com o erro. O que está em volta
   quase sempre importa.
3. **O que você fez, na ordem.** Tipo: "cliquei em Backups, depois em Executar
   Backup Agora, esperei uns 30 segundos, apareceu isso".
4. **A hora aproximada.** Isso me deixa achar o registro exato do que aconteceu
   no servidor.

**Não me mande, nunca:**

- ❌ Senhas, chaves, tokens — nem em print, nem digitados.
- ❌ A chave `BACKUP_ENCRYPTION_KEY`.
- ❌ A chave da API do Asaas.

Se um print tiver uma chave visível por acidente, tampe a parte da chave antes
de mandar.

---

## Checklist para imprimir

```
[ ] 1. Sincronizei e publiquei no Manus
[ ] 2. Marcador de build = 2026-08-12.1-backup-restauravel
[ ] 3. Cartão "Migrações do banco" diz "Banco existente adotado" ou
       "Banco sob controle de migrações"
[ ] 4. BACKUP_ENCRYPTION_KEY copiada e guardada em 2 lugares fora do Manus
[ ] 5.0 Rodei um backup NOVO (os anteriores a 12/08 não restauram)
[ ] 5.1 "Conferir agora" deu faixa VERDE
[ ] 5.2 "Arquivar anexos" com os dois números iguais (ex.: 238/238)
[ ] 5.3 "Migrar parciais" conferido na prévia e confirmado
        (ou o botão não apareceu = nada a fazer)
[ ] 6. Mandei os 5 PDFs + respondi as 3 perguntas da Story 30
[ ] 6. Mandei prints das stories 27 e 28
[ ] 6. Respondi as 3 perguntas de ambiente da Story 24
[ ] 7. Escolhi A, B ou C e informei o horário
```

---

*Documento gerado durante a auditoria técnica. Se alguma tela não estiver como
descrito aqui, é porque o código novo ainda não subiu — volte para a Parte 2.*
