# ADR-0008 — Multi-Zones como base MFE, em multi-repo

**Status:** aceita · **Data:** 2026-09-09 · **Afeta:** [AGENTS.md](../../AGENTS.md), [02](../02-nucleo.md), [04](../04-servicos.md)

## Contexto

O PoC (`apps/host` + `apps/remote`) usa Pages Router com `@module-federation/nextjs-mf`.
Três fatos sobre a ferramenta pesam contra ela — sem suporte a App Router, fim de vida
anunciado, plugin webpack num ecossistema que migrou para Turbopack — mas nenhum decide.

O que decide é estrutural: Pages Router serializa props para `__NEXT_DATA__`, no HTML.
O invariante 2 diz o oposto. No App Router isso é disciplina sobre um caso específico;
no Pages Router é o mecanismo padrão de toda página. Junto com ele caem os elementos
3 (composição no servidor), 4 (Server Action) e 6 (`server-only` como fronteira de
compilação). Adotar MF significaria reconstruir o núcleo e chegar a algo estruturalmente
menos seguro.

## Decisões

| # | Decisão | Razão |
|---|---|---|
| 1 | **Multi-Zones + App Router** como base MFE | preserva os oito elementos do núcleo; MF client-side entregaria o fragmento ao navegador antes de a autorização ser avaliada |
| 2 | **Multi-repo desde o commit 1** | times e ciclos de deploy separados; restrição organizacional |
| 3 | **Verdaccio local** como registry inicial | encanamento de publicação isolado atrás de `.npmrc`; trocar para o registry real não toca aplicação |
| 4 | Superfície do núcleo: **fábricas configuradas** | uma linha por zona; `criarProxy` impede que cada MFE reimplemente sessão e CSP (limitação 4) |
| 5 | **Portas só em três fronteiras** — dados de domínio, store de sessão, provedor de identidade | são as variações que já existem; porta sem consumidor é indireção |
| 6 | **Sem hexagonal por igual** | o domínio está na JVM, não neste código; um BFF hexagonal completo teria o hexágono vazio |
| 7 | Rota da zona vira `app/{zona}/api/bff/` | duas zonas servindo `/api/bff/*` colidem no gateway (limitação 5) |
| 8 | `/api/stream`, `/api/auth/*` e `/api/otel/*` **nunca** são delegados a uma zona | são do shell; rewrite genérico por prefixo os quebraria (limitação 6) |
| 9 | Fatia 1 é **somente leitura** | ver seção seguinte |
| 10 | **O caso de `00-caso.md` é o alvo funcional** — ERP de compras, tela `/pedidos/8821` | o caso já define recursos, atores, projeção esperada e resultados observáveis; a base é construída para atendê-lo, não para um domínio hipotético |
| 11 | `erp-ui` fica fora da rodada 1 | nenhum invariante depende dele, e a limitação 3 já prevê duplicação por zona — medir antes de criar repositório |

## O que a fatia 1 cobre do caso

Dos nove cenários de `00-caso.md`, a fatia 1 cobre os somente leitura: **C1** (mesma rota,
payloads diferentes), **C3 parcialmente** (leitura de `_permissoes`) e **C7** (acesso
revogado → `404` neutro). C2 e C6 dependem de SSE, que é extensão; C4, C5, C8 e C9
dependem de mutação, que é o elemento 4 do núcleo e fica para a rodada 2.

C1 é o cenário central: os quatro atores do caso — `gabrigas`, `marina`, `rafael` e
`carla` — dão quatro resultados observáveis distintos na mesma rota, e `rafael` é o que
prova que **role não é grupo**.

## A fatia 1 é somente leitura, e isso é núcleo ausente

Os elementos **4 (mutação por Server Action com `If-Match`)** e **8 (trace contínuo sem
dado pessoal)** ficam para a rodada 2. Ambos são núcleo, não extensão.

A consequência é operacional e precisa estar escrita: **a base não aceita escrita até a
rodada 2 fechar.** Nenhum documento pode descrever esses dois elementos como opcionais, e
nenhuma zona pode expor Server Action de mutação antes disso. Ausência temporária lida
como opcionalidade é exatamente o erro registrado em [C-011](../CORRECOES.md) e
[ADR-0007](0007-remover-cache-de-payload.md).

## Consequências

**Ganha-se:** App Router, RSC e Server Actions preservados; isolamento de falha e
autorização avaliada no servidor antes de qualquer byte chegar ao navegador; independência
de deploy por zona.

**Perde-se:** compartilhamento de componente React em runtime; deduplicação de dependências
entre zonas — React e o design system são baixados uma vez por zona (limitação 3); e o
**deploy atômico**, descartado pelo multi-repo (limitação 10). O gate de lockstep do
`@erp/nucleo` é o que substitui essa atomicidade.

**Fica em aberto:** se a duplicação de bundle medida justificar Module Federation
restrito à UI — e só à UI, que não carrega dado sensível. Decisão adiada até haver medição.
