# 📊 Relatório de Débito Técnico
**Projeto:** exclusive-club-reservas
**Data:** 2026-07-18
**Versão:** 1.0
**Autor:** @analyst (Alex) — Fase 9 do Brownfield Discovery
**Público-alvo:** Direção / responsável pelo clube (decisão de negócio)

---

> **Premissa de custo (explícita e ajustável):** todos os valores usam **R$ 150/hora** como taxa base de desenvolvimento sênior. Se a sua taxa real for outra, multiplique as horas pela sua taxa. As horas vêm do assessment técnico (faixas conservadoras); os reais são calculados sobre o ponto médio de cada faixa.

---

## 🎯 Executive Summary

### Situação Atual

A plataforma que administra o clube — reservas de embarcações, controle de combustível, vistorias e **cobranças financeiras via Asaas** — está funcional, mas foi construída sem uma "rede de segurança" de engenharia. Uma auditoria técnica completa (somente leitura, sem alterar nada) mapeou **61 pontos de fragilidade**. A maioria é higiene e manutenção (não urgente), mas **3 deles são críticos e representam risco ativo — não teórico** — envolvendo dinheiro, dados de sócios e a chave da conta de pagamentos do clube.

O ponto mais grave não é um "risco que pode acontecer": é uma exposição que **provavelmente já está acontecendo**. O sistema gera backups que empacotam, num único arquivo compactado e **sem qualquer criptografia**, a chave da conta Asaas do clube, tokens de acesso e um dump com dados pessoais dos sócios. Se qualquer um desses arquivos de backup já gerados vazar (e-mail, pen drive, pasta compartilhada, storage mal configurado), quem o obtiver tem acesso direto à conta de cobranças do clube e à base de sócios. Por isso a recomendação é tratar a chave de pagamento como **já comprometida** e rotacioná-la imediatamente.

Além disso, há uma falha que permite que um sócio, usando o próprio cadastro legítimo, **consiga enxergar ou alterar dados de reservas e financeiros de outros sócios** (uma técnica chamada "injeção de SQL de 2ª ordem"), e a ausência total de trilha de auditoria de cobranças — ou seja, hoje **não é possível provar** se uma cobrança foi processada corretamente caso um sócio conteste um valor. Nenhum desses problemas é visível na tela; todos operam em silêncio.

### Números Chave

| Métrica | Valor |
|---------|-------|
| Total de pontos de fragilidade catalogados | **61** |
| 🔴 Críticos (risco ativo) | **3** |
| 🟠 Altos | **14** |
| 🟡 Médios | **26** |
| ⚪ Baixos | **18** |
| Esforço total de resolução | **~650 horas** (faixa 600–700h) |
| Custo total de resolução (R$150/h) | **~R$ 97.500** (faixa R$ 90.000–105.000) |
| **Custo da Emergência de Segurança** (Fase 0) | **~R$ 9.300** (46–78h) |
| Prazo da Emergência | **dias, não semanas** |
| Áreas de maior peso | Integridade financeira, identidade de sócios, segurança de segredos |

### Recomendação

**Autorizar imediatamente a "Janela de Emergência" (4 ações, ~R$ 9.300, poucos dias de trabalho), independentemente de qualquer decisão sobre o resto do programa.** Esses quatro itens estancam a exposição da chave de pagamento, o vazamento de dados entre sócios e a falta de auditoria financeira. Custam menos de **10% do orçamento total** e removem quase todo o risco de um incidente reputacional/financeiro grave. O restante da modernização (Fases 1 a 3) pode ser aprovado depois, com calma, priorizando conforme o orçamento — mas a emergência não deve esperar essa decisão.

---

## 💰 Análise de Custos

### Custo de RESOLVER

Distribuição do esforço por fase (ponto médio das faixas técnicas × R$ 150/h):

| Fase | Escopo | Horas (aprox.) | Custo (R$150/h) |
|------|--------|---------------:|----------------:|
| **Fase 0 — Emergência + CI** | Estancar risco ativo + tornar o resto verificável | **~62h** | **~R$ 9.300** |
| **Fase 1 — Fundação de Dados** | Integridade financeira, transações, isolamento entre sócios | ~145h | ~R$ 21.750 |
| **Fase 2 — UX Crítico** | Eliminar falhas silenciosas e barreiras de acessibilidade | ~91h | ~R$ 13.650 |
| **Fase 3 — Otimização** | Manutenibilidade, higiene, débito restante (oportunista) | ~352h | ~R$ 52.800 |
| **TOTAL** | Programa completo | **~650h** | **~R$ 97.500** |

Recorte por severidade (referência de priorização):

| Categoria | Peso no esforço | Observação |
|-----------|-----------------|------------|
| 🔴 Crítico (3 itens) | ~40–60h | Cabem quase inteiros na Fase 0 (emergência) |
| 🟠 Alto (14 itens) | ~180–290h | Núcleo da Fase 1 (fundação financeira e de identidade) |
| 🟡 Médio (26 itens) | ~180–280h | Fases 2 e 3 |
| ⚪ Baixo (18 itens) | ~80–150h | Fase 3, oportunista — muitos são "quick wins" de 1–2h |

> **Leitura de negócio:** cerca de **54% do orçamento total** (Fase 3) é melhoria de manutenção que pode ser diluída ao longo do tempo. O que **realmente protege o clube** — Fases 0 e 1 — soma **~R$ 31.000** e resolve todos os riscos de segurança e financeiros.

### Custo de NÃO RESOLVER (Risco Acumulado)

Os três críticos não são hipóteses distantes. São vetores de perda concretos:

| Risco | Probabilidade | Impacto no clube | Custo potencial estimado |
|-------|--------------|------------------|--------------------------|
| **Vazamento da chave Asaas via backup sem criptografia** (SYS-22) | **Alta** — o backup já empacota a chave + PII hoje; basta um arquivo vazar | Comprometimento da conta de cobranças; cobranças fraudulentas; desvio de recebíveis; exposição de dados pessoais de **todos** os sócios (LGPD) | **R$ 50.000 – R$ 500.000+** (fraude financeira + multa LGPD até 2% do faturamento, limitada a R$ 50 mi + reparação a sócios + dano reputacional) |
| **Sócio acessa/altera dados de outros sócios** (DB-02, injeção 2ª ordem) | **Média-Alta** — a falha está em 6 pontos do código; explorável por qualquer sócio com cadastro | Quebra de confidencialidade entre sócios de um clube exclusivo; adulteração de reservas e valores financeiros; perda de confiança irreversível | **R$ 30.000 – R$ 200.000+** (evasão de sócios, disputas, LGPD, correção emergencial sob pressão) |
| **Impossível auditar cobranças** (DB-21, sem trilha de webhook) | **Certa** — a trilha simplesmente não existe hoje | Numa contestação de cobrança, o clube **não consegue provar** o que ocorreu; disputas viram "palavra contra palavra"; corrupção financeira não é sequer detectável | **R$ 10.000 – R$ 80.000+** (perdas não recuperáveis, estornos indevidos, tempo de investigação forense sem dados) |
| **Corrupção silenciosa de cobrança** (webhook responde "OK" antes de processar) | **Média** — ocorre a cada falha transitória de rede | Pagamento confirmado pelo Asaas mas **não registrado** no sistema → sócio pagou e consta como devedor (ou o inverso) | **R$ 5.000 – R$ 40.000+** (retrabalho, conciliação manual, atrito com sócios pagantes) |

> **Comparação direta:** o cenário **mais provável e mais barato de acontecer** (vazamento de um backup) já supera, sozinho, o custo de **todo** o programa de remediação. A emergência custa **~R$ 9.300**; um único incidente de vazamento de dados de sócios de um clube exclusivo custa facilmente **5 a 50 vezes isso** — sem contar o dano reputacional, que em um clube de membros selecionados é o ativo mais difícil de recuperar.

---

## 📈 Impacto no Negócio

### 🔒 Segurança e dados dos sócios
Hoje, a chave que movimenta dinheiro na conta do clube e a lista completa de dados pessoais dos sócios estão embaladas juntas, sem cadeado, em cada backup gerado. É o equivalente a guardar a chave do cofre e a ficha de todos os sócios dentro de uma caixa de papelão etiquetada "backup", que circula por e-mail e pastas. Some-se a isso a falha que permite um sócio bisbilhotar/alterar dados de outro sócio, e o clube tem uma exposição de privacidade incompatível com a promessa de exclusividade e discrição que justifica a mensalidade.

### 💳 Confiabilidade financeira
O sistema confirma ao provedor de pagamento que "recebeu e processou" **antes** de realmente processar. Se algo falhar no meio, o pagamento se perde de vista — o sócio pagou, mas o sistema não registra. E como não existe trilha de auditoria de cobranças, **não há como reconstruir o que aconteceu**. Numa disputa, o clube fica sem provas. Para uma operação que cobra mensalidades e serviços via Asaas, isso é um risco direto de receita e de relacionamento.

### 👤 Experiência do usuário
Várias telas escondem erros: quando algo falha ao carregar, o sócio vê uma lista vazia (como se "não houvesse nada") em vez de um aviso de erro. Uma vistoria pode ser enviada **sem a foto** e o sistema não avisa. Ações destrutivas (excluir, restaurar backup) usam confirmações frágeis. Nada disso derruba o sistema, mas corrói a confiança do usuário e gera chamados de suporte que parecem "bugs fantasma".

### 🔧 Manutenibilidade
O código não roda testes automáticos (existem 83 testes escritos que **nunca são executados**), tem arquivos gigantes (um deles com quase 6.000 linhas) e configurações duplicadas. Na prática: cada nova alteração é feita "às cegas", o risco de quebrar algo que funcionava é alto, e o custo de qualquer evolução futura é maior do que deveria. Ligar os testes (item #0, ~R$ 1.200–1.500) é o investimento de maior alavancagem do projeto: transforma todo o resto de "arriscado" em "verificável".

---

## ⏱️ Timeline Recomendado

### Fase 0 — Emergência de Segurança  *(dias, não semanas — ~R$ 9.300)*
Estanca o risco ativo e liga a "rede de segurança". **Nada aqui espera** por decisões sobre o resto.
- **#0 — Ligar o CI** (~R$ 1.200): rodar os 83 testes existentes + build a cada alteração; qualquer alteração passa a ser verificável.
- **E-1** — Eliminar a falha que permite um sócio ver/alterar dados de outro (injeção SQL).
- **E-2** — Remover a chave de pagamento e os dados pessoais dos backups, criptografar o backup e **auditar todos os backups já gerados**.
- **E-3** — Tirar a chave Asaas do banco de dados e **rotacioná-la** (tratar como comprometida).
- **E-4** — Recriar a trilha de auditoria de cobranças (hoje inexistente).
- **Gate de saída:** testes rodando e bloqueando alterações ruins; segredos fora do banco e rotacionados; zero vazamento entre sócios; auditoria de pagamento gravando.

### Fase 1 — Fundação de Dados e Integridade Financeira  *(~R$ 21.750)*
Base íntegra e à prova de falhas parciais.
- Reconciliar o histórico de migrações do banco (pré-requisito para tudo que mexe em estrutura de dados).
- Envolver os fluxos de cobrança/pagamento em **transações** (ou tudo funciona, ou nada é gravado pela metade).
- Corrigir o webhook para só confirmar depois de processar, com proteção contra processamento duplicado.
- Fechar o "risco de identidade" (e-mail mutável usado como chave), garantindo isolamento real entre sócios.
- Índices de performance (ganho rápido) e limpeza de configurações duplicadas do Asaas.

### Fase 2 — UX Crítico  *(~R$ 13.650)*
Elimina as falhas invisíveis ao usuário.
- Padrão único de tratamento de erro (erro vira aviso, não lista vazia).
- Confirmações reais para ações destrutivas.
- Acessibilidade (navegação por teclado, botões com rótulo — conformidade WCAG).
- Bloquear envio de vistoria sem foto.
- Guarda de permissão por rota no frontend.

### Fase 3 — Otimização / Débito Restante  *(~R$ 52.800 — oportunista)*
Manutenibilidade e higiene, diluível no tempo.
- Quebrar arquivos monolíticos, consolidar módulos de e-mail/PDF, padronizar tipos monetários e temporais, remover código morto, dezenas de "quick wins" de 1–2h.

---

## 📊 ROI da Resolução

**Regra de ouro deste projeto:** o retorno se concentra nas Fases 0 e 1.

| Investimento | Custo | O que compra |
|--------------|------:|--------------|
| **Só a Emergência (Fase 0)** | **~R$ 9.300** | Remove ~90% do risco de incidente grave (vazamento de chave, vazamento entre sócios, cegueira financeira) |
| **Emergência + Fundação (Fases 0+1)** | **~R$ 31.000** | Sistema financeiro íntegro e seguro; base sólida para crescer |
| **Programa completo (Fases 0–3)** | **~R$ 97.500** | Acima + experiência do usuário polida + código sustentável e barato de evoluir |

**Cálculo de ROI da Emergência:**
- **Custo evitado (cenário mais provável — vazamento de backup):** conservadoramente **R$ 50.000+** só em componente financeiro/multa, sem contar reputação.
- **Investimento:** ~R$ 9.300.
- **ROI ≈ 5x a 50x** apenas na Fase 0, considerando um único incidente evitado — e o incidente em questão tem **probabilidade alta**, não teórica.

Para um clube exclusivo, o **componente reputacional** amplifica tudo: a notícia de que "os dados dos sócios do clube vazaram" ou "dá para ver a conta de outro sócio" não tem preço de recuperação fácil — pode significar evasão de membros e desgaste de marca que anos de operação impecável não revertem. Sob essa ótica, **~R$ 9.300 para eliminar essa exposição é, essencialmente, um seguro barato contra um prejuízo desproporcional.**

> **Nível de confiança:** ALTO para a existência e severidade dos 3 críticos (confirmados por código, com linhas específicas citadas no assessment técnico). MÉDIO para os valores monetários de "custo de não resolver" — são estimativas de faixa, não cotações; o objetivo é dar ordem de grandeza para decisão, não precisão contábil. As **horas de resolução** vêm de faixas técnicas conservadoras e podem variar ±15%.

---

## ✅ Próximos Passos

1. [ ] **Aprovar orçamento** — decidir entre (a) só Emergência ~R$ 9.300, (b) Emergência + Fundação ~R$ 31.000, ou (c) programa completo ~R$ 97.500.
2. [ ] **Autorizar a remediação de emergência (E-1 a E-4)** — pode começar **imediatamente**, em paralelo, independente de qualquer outra decisão. Inclui rotacionar a chave Asaas (tratá-la como já comprometida) e auditar os backups existentes.
3. [ ] **Priorizar quais débitos entram em desenvolvimento** nas Fases 1–3 — *aguardando decisão do responsável pelo projeto* sobre ritmo e orçamento.

---

## 📎 Anexos

- `docs/prd/technical-debt-assessment.md` — assessment técnico completo (Fase 8, 61 débitos, evidências de código linha a linha)
- `docs/reviews/` — reviews de especialistas (`db-specialist-review.md`, `ux-specialist-review.md`, `qa-review.md`, `qa-gap-coverage-addendum.md`)
- `docs/architecture/` — visão geral do sistema (plataforma de gestão do clube)
- `docs/database/` — auditoria e esquema de dados
- `docs/frontend/` — especificação de frontend/UX

---

*Relatório executivo gerado na Fase 9 do workflow Brownfield Discovery. Traduz o assessment técnico (Fase 8) em termos de decisão de negócio. Não modifica código nem infraestrutura — análise somente-leitura.*
