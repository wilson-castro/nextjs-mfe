---
doc: 12-trilha
publico: [humano]
---

# 12 — Trilha de acompanhamento

Do zero à autonomia. Cinco etapas, cada uma com leitura, exercício e um critério
objetivo de conclusão. **Não pule etapas** — cada uma pressupõe a anterior.

Tempo estimado: 3 a 5 dias para quem já conhece React; 1 a 2 semanas para quem não conhece.

---

## Etapa 0 — As duas separações (1 hora)

**Objetivo:** entender as duas classificações antes de ver qualquer código.

**Leitura:** [`AGENTS.md`](../AGENTS.md) até "A separação que governa tudo";
[01 — Camadas](01-camadas.md) §7.

**Exercício.** Para cada componente, diga se é núcleo ou extensão e justifique com o
teste de remoção: sessão opaca · relay do SSE · `If-Match` · atualização otimista ·
allowlist outbound · cache de cliente · CSP com nonce.

**Critério:** você aplica o teste sem consultar a tabela, e explica por que o cache de
payload reprovou nele.

---

## Etapa 1 — Fronteiras (meio dia)

**Objetivo:** entender o que executa onde e por quê.

**Leitura**
- [`AGENTS.md`](../AGENTS.md), seções "Invariantes" e "Regras de decisão rápida"
- [`01-camadas.md`](01-camadas.md), completo
- Diagrama de arquitetura (`arquitetura-bff.svg`)

**Exercício**
1. Abra `/pedidos/8821` em produção com DevTools na aba Network.
2. Localize a resposta do documento HTML. Procure por `self.__next_f.push`.
3. Identifique quais dados estão ali e quais não estão.
4. Procure por qualquer token. Não vai encontrar — entenda por quê.

**Critério de conclusão:** você consegue explicar, sem consultar, por que o bloco de
condição comercial não aparece no HTML de um usuário sem o grupo — e por que não
aparece nem como campo vazio.

---

## Etapa 2 — Caminho de uma leitura (1 dia)

**Objetivo:** seguir uma requisição do clique até o banco.

**Leitura**
- [`04-servicos.md`](04-servicos.md), seções 1 a 3
- [`09-convencoes.md`](09-convencoes.md), seções 1 a 3

**Exercício**

Rastreie, no código, a jornada completa de `GET /pedidos/8821`:

```
proxy.ts → (app)/layout.tsx → pedidos/[id]/page.tsx
  → lib/pedidos/dal.ts → lib/upstream/client.ts
  → lib/session.ts → Redis → Spring
```

Em cada arquivo, anote: **que decisão é tomada aqui?**

**Critério:** você desenha esse fluxo de memória, marcando em que ponto a sessão é
exigida, em que ponto o token é anexado, e por que não há cache entre a DAL e o domínio
— ver [ADR-0007](adr/0007-remover-cache-de-payload.md).

---

## Etapa 3 — Caminho de uma escrita (1 dia)

**Objetivo:** entender concorrência otimista e propagação.

**Leitura**
- [`06-seguranca.md`](06-seguranca.md), seções 5 e 6
- [`ADR-0004`](adr/0004-sse-em-vez-de-websocket.md)

**Exercício**
1. Abra a mesma tela em dois navegadores, com usuários diferentes do mesmo grupo.
2. Altere o registro em um. Meça quanto tempo o outro leva para refletir.
3. Agora abra o formulário de edição nos dois e salve em ambos. Observe o `409`.
4. No DevTools, inspecione o frame SSE. Confirme que ele carrega só `{tipo, id, versão, escopo, motivo}`.

**Critério:** você explica por que o evento é fino, e o que aconteceria se ele carregasse
o registro completo.

---

## Etapa 4 — Decisões (1 dia)

**Objetivo:** saber por que as coisas são como são, para não desfazer sem querer.

**Leitura**
- [`05-decisoes.md`](05-decisoes.md) e os seis ADRs
- [`08-desempenho.md`](08-desempenho.md), seções 2 e 7

**Exercício — discussão, não código**

Para cada afirmação, decida se é verdadeira e justifique:

1. "Podemos cachear o pedido com `"use cache"` passando só o id."
2. "Vamos usar React Query também na tela de detalhe, fica mais consistente."
3. "O BFF sempre reduz latência."
4. "Sessão e cache podem dividir a mesma instância de Redis."
5. "Se o usuário não é ADMIN, podemos esconder o botão e pronto."
6. "WebSocket seria melhor porque é mais moderno."

*Gabarito:* todas falsas. As justificativas estão nos ADRs 0003, 0005, 0001, 0002,
em [`06-seguranca.md`](06-seguranca.md) §2 e no ADR-0004, respectivamente.

**Critério:** você defende cada resposta citando a consequência concreta, não o princípio.

---

## Etapa 5 — Primeira contribuição (1 a 2 dias)

**Objetivo:** entregar algo sem quebrar invariante.

**Leitura**
- [`11-testes.md`](11-testes.md)
- [`CORRECOES.md`](CORRECOES.md) — erros já cometidos neste projeto

**Exercício**

Implemente um bloco novo na tela de detalhe, seguindo o padrão do bloco de remessas.
Requisitos:

- [ ] busca via DAL, com cache e escopo na chave
- [ ] reage a evento SSE do recurso
- [ ] `<Suspense>` próprio, para não bloquear o resto da página
- [ ] se o endpoint responder `404`, o bloco some sem derrubar a página
- [ ] nenhum DTO passado como prop para ilha client
- [ ] teste de vazamento cobrindo os campos do bloco

**Critério:** PR aprovado com `test:vazamento` e `test:e2e` verdes.

---

## Consulta contínua

Depois da trilha, estes documentos deixam de ser leitura e viram referência:

| Situação | Documento |
|---|---|
| Algo quebrou em produção | [`10-runbook.md`](10-runbook.md) |
| Um termo não faz sentido | [`13-glossario.md`](13-glossario.md) |
| Vai propor mudança estrutural | [`05-decisoes.md`](05-decisoes.md) |
| Vai instrumentar ou investigar trace | [`07-observabilidade.md`](07-observabilidade.md) |
| Discussão sobre hospedagem | [`08-desempenho.md`](08-desempenho.md) |

## Sinais de que a trilha não foi absorvida

Se você observar qualquer um destes em revisão de código, volte à etapa indicada:

| Sintoma | Volte à etapa |
|---|---|
| `fetch('/api/bff/...')` dentro de Server Component | 2 |
| DTO inteiro como prop de componente `'use client'` | 1 |
| Verificação de role no lugar de `_permissoes` | 4 |
| `403` em vez de `404` | 1 |
| `useQuery` para dado que o RSC já traz | 4 |
| Qualquer cache de payload reintroduzido no BFF | 4 (ler o ADR-0007 antes) |
