---
doc: 05-decisoes
publico: [humano, agente]
---

# 05 — Decisões

Índice das decisões de arquitetura. Cada uma tem um ADR próprio com contexto,
alternativas consideradas e consequências aceitas.

> ⚠️ **Leia [PENDENCIAS.md](PENDENCIAS.md) antes deste documento.** Sete itens bloqueiam produção, e
> três deles afetam ADRs listados abaixo. Um ADR marcado "aceita" aqui não significa
> "validado em produção".

**Antes de propor mudança estrutural, leia o ADR correspondente.** Se a decisão
continuar fazendo sentido, você economizou uma discussão. Se não, abra um ADR novo
que supersede o antigo — não edite o original.

## Índice

| ADR | Decisão | Status |
|---|---|---|
| [0001](adr/0001-bff-em-vez-de-token-no-navegador.md) | BFF em vez de token no navegador | aceita |
| [0002](adr/0002-redis-como-store-de-sessao.md) | Redis como store de sessão | aceita; instância única após 0007; **lock depende do IdP** (§4) |
| [0003](adr/0003-cache-com-escopo.md) | Cache explícito com escopo | ⛔ **supersedida por 0007** |
| [0004](adr/0004-sse-em-vez-de-websocket.md) | SSE em vez de WebSocket | ⚠️ escolha do protocolo aceita; **contrato de retomada em aberto** (§1) |
| [0005](adr/0005-tanstack-query-com-escopo-limitado.md) | TanStack Query apenas nas ilhas, não na aplicação toda | aceita, com correção de API |
| [0006](adr/0006-csp-nonce-vs-estatico.md) | CSP: nonce na zona autenticada, hash na zona pública | aceita |
| [0007](adr/0007-remover-cache-de-payload.md) | **Remover o cache de payload do BFF** | aceita |

Comparação lado a lado das duas variantes, com código completo:
[14 — Variantes X e Y](14-variantes-de-cache.md).

O [02 — Núcleo](02-nucleo.md) define a base mínima e a regra que
separa núcleo de extensão. **Leia-o antes de propor componente novo.**

## Resumo executivo

**Por que BFF.** O requisito de manter a credencial fora do navegador é inegociável, e
força uma camada de servidor. O Next.js já é essa camada. A RFC 10017 / BCP 212 classifica
o BFF como o mais seguro dos três padrões para aplicações de navegador.

**Por que Redis.** Sessão opaca exige lookup; lookup com N réplicas exige store
compartilhado. Uma instância, `noeviction`, apenas sessão.

**Por que nenhum cache de payload no BFF.** O payload carrega `_permissoes`, capacidades
calculadas que dependem de role e de regras temporais — dimensões que nem a chave nem o
`ETag` capturam. O caminho de `304` renovava o frescor e devolvia o corpo antigo, tornando
a obsolescência **indefinida**. Corrigir exigiria validador derivado da resposta, o que
obriga o domínio a montar a resposta para responder `304` — eliminando a economia que
justificava o cache.

**Por que TanStack só nas ilhas.** Duas fontes de verdade para o mesmo dado produzem dois
valores de `versao` em memória, e o `If-Match` pode usar o errado. O sintoma é um `409`
intermitente que ninguém reproduz.

**Por que SSE.** Tráfego unidirecional; reconexão nativa do protocolo; passa por proxies
HTTP comuns. WebSocket traria bidirecionalidade que não usamos.

## Como estas decisões se organizam

| Decisão | Núcleo ou extensão |
|---|---|
| BFF em vez de token no navegador (0001) | **núcleo** — deriva do requisito |
| Redis para sessão (0002) | **núcleo** — sessão opaca exige lookup |
| SSE em vez de WebSocket (0004) | extensão — escolha de protocolo para o tempo real |
| TanStack com escopo limitado (0005) | extensão — cache de cliente |
| CSP com nonce (0006) | extensão — defesa em profundidade |
| Remover cache de payload (0007) | **removeu** o que parecia extensão e não era |

O ADR-0007 é o caso didático: o cache falhou no teste de extensão em quatro pontos, e
como núcleo não se sustentava. Ver [02 — Núcleo](02-nucleo.md) §1.

Comparação lado a lado das duas variantes, com código completo:
[14 — Variantes X e Y](14-variantes-de-cache.md).

## O que estas decisões custam

- um salto de rede a mais e um processo a mais para operar
- sessão com estado, portanto um ponto de falha que uma SPA pura não teria
- disciplina permanente contra vazamento no payload RSC
- toda leitura chega ao domínio: ~267 chamadas/s com 2.000 usuários, no modelo
- disponibilidade do BFF acoplada à do domínio

Com um único cliente e uma API bem modelada, nada disso se justificaria. O que justifica
aqui é o requisito de credencial. Se ele mudar, revisite o ADR-0001.
