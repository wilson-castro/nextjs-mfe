# ADR-0004 — SSE em vez de WebSocket

**Status:** aceita · **Data:** 2026-08

## Contexto

A especificação exige atualização em tempo real com propagação em ≤ 2 s, disparada tanto
por ação de usuário quanto por evento externo, com destinatários resolvidos por ACL no
servidor. O evento é **fino**: carrega `{tipo, id, versão, escopo, motivo}` e nada mais.

O tráfego é essencialmente unidirecional: o servidor avisa, o cliente decide se revalida.
As mutações continuam indo por HTTP normal.

## Alternativas

| Opção | Trade-off |
|---|---|
| **SSE** | unidirecional, reconexão nativa, passa por proxies HTTP |
| WebSocket | bidirecional; exige protocolo próprio, reconexão manual, retomada manual |
| Long polling | funciona em qualquer infraestrutura; custo alto de conexões |
| Polling simples | mais simples de tudo; latência = intervalo; não atende 2 s sem carga pesada |
| WebTransport | promissor; suporte irregular |

## Decisão

SSE, com uma conexão por aba contra o BFF, multiplexando todos os tópicos.
O BFF mantém a conexão upstream com o domínio.

## Por que SSE ganha aqui

1. **Reconexão é do protocolo; retomada não é.** `Last-Event-ID` é enviado automaticamente
   pelo navegador. Com WebSocket, você reimplementa isso.
2. **Unidirecional é exatamente o que precisamos.** Bidirecionalidade seria superfície
   ociosa — e superfície ociosa em canal persistente é risco.
3. **Cookie viaja naturalmente.** O `EventSource` envia o cookie de sessão sem configuração.
4. **Atravessa proxies HTTP.** Não exige upgrade de protocolo em cada camada de rede.

## Consequências

- **Buffering em proxy é o risco operacional número um.** `X-Accel-Buffering: no` resolve
  nginx; ingress controllers variam. Validar em cada ambiente. Ver [08](../10-runbook.md).
- **A conexão vive mais que o access token.** O loop de reconexão relê o token a cada
  tentativa e trata `401` como retry, não como erro.
- **Fan-out com múltiplas réplicas exige barramento.** A conexão de um usuário está
  pendurada em uma réplica, mas o evento pode nascer em outra. Redis pub/sub ou tópico
  Kafka dedicado.
- **Reconexão simultânea causa rajada.** Quando o BFF reinicia, todas as abas reconectam
  juntas e cada uma dispara revalidação. Exige jitter.

## Latência

O RTT entra apenas no estabelecimento da conexão. Cada evento paga metade do RTT.
Mesmo no pior cenário de topologia (~30 ms), a folga sobre os 2 s é de 98,5%.
**O gargalo dos 2 s é o processamento no domínio e o debounce do cliente, não a rede.**


---

## Adendo — duas contradições identificadas em auditoria externa

### A. Retomada não é propriedade do protocolo

O texto acima diz que "reconexão e retomada são do protocolo". **Só a primeira é.**
O navegador envia `Last-Event-ID`; o servidor só reenvia o que tiver guardado.

Se o transporte for Redis Pub/Sub, não há o que reenviar: Pub/Sub é **at-most-once** e
mensagem para subscriber desconectado se perde permanentemente. A própria Redis recomenda
Streams ou estado durável quando replay é necessário.

O argumento "o `router.refresh()` do `onopen` cobre os eventos perdidos" **também não se
sustenta**, porque esse refresh lê o mesmo cache que perdeu a invalidação:

```
1. domínio altera v42 → v43
2. BFFs fora do ar; evento Pub/Sub se perde
3. cache ainda tem v42, dentro do TTL
4. BFF volta; navegador reconecta; router.refresh()
5. o BFF responde v42 — do cache
```

### B. Dois desenhos de transporte no mesmo ADR

O ADR começa dizendo "o BFF mantém a conexão upstream com o domínio" e depois descreve
fan-out por `sse:user:{sub}` via Redis Pub/Sub. São arquiteturas diferentes:

```
Spring → SSE → BFF                            (conexão por usuário)
Spring → Redis Pub/Sub → BFF → SSE → navegador (fan-out por canal)
```

**Qual é a vigente ainda não está decidido.** Ver [PENDENCIAS](../PENDENCIAS.md) §1.
Até lá, este ADR não deve ser citado como decisão fechada sobre transporte ou retomada.
