---
doc: 07-observabilidade
publico: [humano, agente]
---

# 07 — Observabilidade

## 1. Princípio

Um trace por intenção do usuário, contínuo do navegador até o domínio, **sem dado
pessoal em nenhum span**.

```
ui.pedido.remover_remessa            (navegador)
 └─ POST /pedidos/8821               (Server Action)
     └─ bff.pedidos.remessas.delete  (BFF)
         └─ DELETE /pedidos/…        (HTTP)
             └─ pedidos.remessa.remover (domínio)
                 └─ publicação do evento
```

## 2. Três arquivos, três escopos

| Arquivo | Executa em | Cuidado principal |
|---|---|---|
| `instrumentation.ts` | servidor, no boot | guardar por `NEXT_RUNTIME === 'nodejs'` |
| `otel.node.ts` | servidor | suprimir headers dos spans |
| `instrumentation-client.ts` | navegador | allowlist de atributos e de propagação |

## 3. Navegador — permitido, com restrições

| Permitido | Proibido |
|---|---|
| rota lógica (`/pedidos/[id]`) | qualquer dado pessoal |
| nome da ação | e-mail, nome |
| duração e resultado | identificador de sessão |
| identificador do recurso | nome de grupo |
| — | token |
| — | valores de formulário |
| — | query string com termo livre |

Três garantias na implementação:

**Exportador aponta para o BFF, nunca para o coletor.**

```ts
new OTLPTraceExporter({ url: '/api/otel/v1/traces' })
```

**Propagação por allowlist explícita.** `traceparent` só sai para a mesma origem:

```ts
new FetchInstrumentation({
  propagateTraceHeaderCorsUrls: [],       // nenhuma origem externa
  ignoreUrls: [/\/api\/otel/, /\/_next\//],
})
```

**Sanitizador antes do batch.** Nada fora da allowlist chega a ser exportado:

```ts
class Sanitizador implements SpanProcessor {
  onEnd(span) {
    for (const k of Object.keys(span.attributes))
      if (!PERMITIDOS.has(k)) delete span.attributes[k]
  }
}
// ordem importa: [new Sanitizador(), new BatchSpanProcessor(exportador)]
```

## 4. Proxy de telemetria

`/api/otel/v1/traces` existe para três coisas que o navegador não pode garantir:

| Função | Implementação |
|---|---|
| Autenticação | sem sessão, responde `204` e descarta em silêncio |
| Limite de taxa | 60 lotes por minuto por usuário |
| Tamanho máximo | 256 KB por requisição |

Isso mantém `connect-src 'self'` na CSP: SSE, API e telemetria passam todos pelo BFF.

## 5. Servidor

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') await import('./otel.node')
}

export async function onRequestError(err, request, context) {
  trace.getActiveSpan()?.recordException(err)
  console.error(JSON.stringify({
    level: 'error', msg: err.message, path: request.path,
    routeType: context.routeType,       // 'render' | 'action' | 'route'
  }))
}
```

Dois cuidados obrigatórios em `otel.node.ts`:

```ts
'@opentelemetry/instrumentation-undici': {
  // Authorization vazaria para o backend de traces
  headersToSpanAttributes: { requestHeaders: [], responseHeaders: [] },
},
'@opentelemetry/instrumentation-http': {
  responseHook: (_span, res) => {
    res.removeHeader?.('traceresponse')
    res.removeHeader?.('server-timing')
  },
},
```

## 6. Evento externo

Trace nasce no consumidor, com **link** para o produtor — não como filho, porque não há
relação de causalidade síncrona.

```java
var span = tracer.spanBuilder("consumer.estoque.lote.bloqueado")
    .setNoParent()
    .addLink(Span.fromContext(contextoProdutor).getSpanContext())
    .startSpan();
```

A entrega SSE entra como `sse.fanout` com **quantidade** de destinatários, nunca identidade.

## 7. Correlação de erro

O usuário vê `supportId`. O log tem `supportId` **e** `trace_id`. A resposta HTTP nunca
tem `trace_id`.

```
log:      supportId=0K3F9 trace_id=4bf92f… codigo=REGISTRO_DESATUALIZADO
resposta: { "codigo": "REGISTRO_DESATUALIZADO", "supportId": "0K3F9" }
```

Para investigar: buscar o `supportId` no log, extrair o `trace_id`, abrir no backend de traces.

## 8. Verificação

- [ ] O mesmo `trace_id` aparece do span de navegador ao span do domínio
- [ ] Nenhum atributo fora da allowlist em nenhum span
- [ ] `traceresponse` ausente das respostas HTTP
- [ ] Nenhuma variável OTel com prefixo `NEXT_PUBLIC_`
