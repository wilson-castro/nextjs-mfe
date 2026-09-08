---
doc: 03-extensoes
publico: [humano, agente]
pre_requisito: 02-nucleo.md
---

# 03 — Extensões

Tudo que não está no [núcleo](02-nucleo.md). Cada extensão tem um **modo de degradação
declarado**: o que exatamente piora quando ela é desligada.

Se você não consegue escrever esse parágrafo, o componente não é extensão.

---

## 1. Inventário

| Extensão | Se desligar | Vive em |
|---|---|---|
| [Tempo real (SSE)](#2-tempo-real-sse) | a tela atualiza na navegação, em vez de em ~2 s | servidor + cliente |
| [Cache no domínio](#3-cache--no-domínio) | mais carga de leitura no domínio | fora do BFF |
| [Cache de cliente](#4-cache-de-cliente-react-query) | refetch a cada montagem | cliente |
| [Atualização otimista](#5-atualização-otimista) | o usuário espera a resposta HTTP | cliente |
| [Telemetria de navegador](#6-telemetria-de-navegador) | o trace começa no BFF | cliente + proxy |
| [CSP com nonce](#7-csp-com-nonce) | política mais fraca contra XSS | `proxy.ts` |

Nenhuma delas altera resposta HTTP, decisão de autorização ou contrato de erro.

---

## 2. Tempo real (SSE)

**Degradação:** a tela atualiza na navegação, em vez de em ~2 s.

### 2.1 Contrato de não-contaminação

O relay é **repasse puro**. Não invalida, não coordena, não decide.

```ts
// app/api/stream/route.ts — o loop inteiro
for await (const evento of parseSse(upstream.body, abort.signal)) {
  if (evento.id) ultimoId = evento.id
  send(formatar(evento))       // allowlist de campos; nada além do contrato atravessa
}
```

O cliente traduz evento em `router.refresh()`, que executa **exatamente o mesmo caminho da
navegação**. Nenhum módulo do núcleo sabe que o SSE existe.

> **Regra.** Se o SSE precisar que algo do núcleo mude de comportamento, ele deixou de ser
> extensão. Foi o que aconteceu quando o relay passou a invalidar cache — ver
> [ADR-0007](adr/0007-remover-cache-de-payload.md).

### 2.2 Semântica do canal: notificação efêmera

O canal **não guarda estado**. Redis Pub/Sub é at-most-once, e isso é aceito.

| Evento | Precisa acumular? | Onde a durabilidade vive |
|---|---|---|
| `notificacao.usuario` | **sim** | domínio de notificações, no banco |
| `recurso.alterado` | não | é dica de revalidação |
| `dependencia.alterada` | não | idem |
| `recurso.excluido` | não | a próxima leitura devolve `404` |
| `sessao.revalidar` | não | a próxima leitura resolve |

**Notificação é estado do domínio, não do canal.** Tem endpoint próprio, contador e
histórico paginado. Se o frame se perder, o próximo `GET /notificacoes` reconcilia.

Consequências normativas:

- `Last-Event-ID` **não é garantia de retomada**; janela máxima de 30 s ou nenhuma
- nenhum documento pode descrever eventos como replayáveis
- não existe amplificação por replay, porque não existe replay

### 2.3 Contrato do evento

```
event: recurso.alterado
id: 01J9F2K7T3
data: {"tipo":"pedido","id":"8821","versao":42,"escopo":"pedidos:lista"}
```

O evento não carrega autor, e-mail, nome de grupo, valor ou qualquer campo do registro.
Destinatários resolvidos pelo domínio **no instante da emissão** — nunca "envia para todos
e o cliente filtra".

### 2.4 Riscos de reconexão

Atinge 100% dos conectados de uma vez, e ocorre a cada deploy. Seis riscos, com mitigação
em ~30 linhas de código.

| # | Risco | Mitigação |
|---|---|---|
| R-1 | Amplificação por `Last-Event-ID` | janela máxima de 30 s |
| R-2 | Ciclo permanente por idle timeout < heartbeat | `idle_timeout > heartbeat × 3` |
| R-3 | Retry storm contra serviço degradado | campo `retry:` no stream |
| R-4 | Tempestade de deploy | jitter + drenagem no `SIGTERM` |
| R-5 | Abas em segundo plano recarregando | guarda de `visibilityState` |
| R-6 | Conexões zumbi | heartbeat detecta ao escrever |

```ts
// primeira coisa que o stream envia — EventSource não tem backoff exponencial garantido
send('retry: 15000\n\n')

// guarda de visibilidade: ~55% das abas estão em segundo plano
es.onopen = () => {
  setSincronizado(true)
  if (!jaConectou.current) { jaConectou.current = true; return }
  if (document.visibilityState === 'visible') startTransition(() => router.refresh())
  else precisaRefresh.current = true
}

// jitter: o retry: do servidor não randomiza
es.onerror = () => {
  es.close()
  setTimeout(reconectar, 1000 + Math.random() * 9000)
}
```

**R-2 é o mais insidioso:** não é pico, é regime. Sintoma diagnóstico é taxa de reconexão
constante e não-nula em regime estacionário — que se disfarça de carga normal em gráfico
agregado. Ver [10 — Runbook](10-runbook.md) §2.1.

### 2.5 Coalescing

Um evento de domínio vira **N renders**, onde N é o número de espectadores. O debounce por
recurso não resolve rajada com muitos recursos distintos.

```ts
// StreamProvider — uma janela de refresh para TODOS os eventos
const pendentes = useRef(new Set<string>())
const timer = useRef<ReturnType<typeof setTimeout>>()

const agendarRefresh = (id: string) => {
  pendentes.current.add(id)
  if (timer.current) return
  timer.current = setTimeout(() => {
    startTransition(() => router.refresh())   // um refresh cobre todos os ids
    pendentes.current.clear()
    timer.current = undefined
  }, 400)
}
```

---

## 3. Cache — no domínio

**Degradação:** mais carga de leitura no domínio. **Nenhuma resposta muda.**

Esta é a extensão mais importante de posicionar corretamente, porque é a que reprovou no
teste de extensão quando morava no BFF.

### 3.1 Por que pertence ao domínio

O payload contém `_permissoes` — capacidades **calculadas**, cujas entradas incluem role e
regras temporais. No BFF, nem a chave nem o `ETag` capturavam essas dimensões, e o caminho
de `304` renovava o frescor devolvendo o corpo antigo: a obsolescência ficava **indefinida**,
não limitada pelo TTL.

No domínio, as três dificuldades somem:

| Dificuldade no BFF | No domínio |
|---|---|
| chave precisa representar a projeção | chave é natural: `pedido:{id}` |
| validador precisa codificar a representação | não há negociação de validador |
| capacidades congelam | são recalculadas a cada resposta |

**É o único lugar onde quem cacheia sabe do que o dado depende.**

### 3.2 Quando adicionar

Três condições, em conjunto:

1. medição mostra o domínio como gargalo de leitura, sob ~300 req/s
2. o cache fica **no domínio**, não no BFF
3. as capacidades continuam sendo recalculadas por resposta

Ver [ADR-0007](adr/0007-remover-cache-de-payload.md) e
[14 — Variantes X e Y](14-variantes-de-cache.md).

### 3.3 O que fazer antes

Na ordem, porque são mais baratas que introduzir cache:

1. reduzir blocos por página, ou carregá-los sob demanda
2. paginar itens e lotes no domínio
3. escalar réplicas do domínio

---

## 4. Cache de cliente (React Query)

**Degradação:** refetch a cada montagem; scroll e paginação ficam piores.

### 4.1 Escopo autorizado

**RSC busca o que o servidor renderiza. React Query busca só o que o cliente precisa
buscar sozinho. Nunca os dois para o mesmo dado.**

| Ilha | Justificativa |
|---|---|
| `Lista` | otimismo + invalidação seletiva |
| `Timeline` | paginação incremental com scroll preservado |
| `PainelRealtime` | polling de fallback quando o SSE cai |
| `BadgeNotificacoes` | dedup com o painel |

Proibido: qualquer dado já renderizado por Server Component.

### 4.2 Por que a regra existe

Duas fontes de verdade para o mesmo dado produzem dois valores de `versao` em memória, e o
`If-Match` da mutação pode usar o errado. O sintoma é um `409` intermitente que ninguém
reproduz. Ver [ADR-0005](adr/0005-tanstack-query-com-escopo-limitado.md).

### 4.3 Hook unificado

```ts
export function useRevalidacao<T>({ chave, buscar, aceita, staleTime = 30_000, pollingMs, inicial }) {
  const qc = useQueryClient()
  const { assinar, sincronizado } = useStream()

  const q = useQuery({
    queryKey: chave, queryFn: buscar, staleTime, initialData: inicial,
    refetchInterval: !sincronizado && pollingMs ? pollingMs : false,
    refetchOnWindowFocus: !sincronizado,
  })

  // refs: o handler não pode capturar valores de uma renderização antiga
  const dadosRef = useRef(q.data), aceitaRef = useRef(aceita), chaveRef = useRef(chave)
  useEffect(() => { dadosRef.current = q.data; aceitaRef.current = aceita; chaveRef.current = chave })

  useEffect(() => assinar((nome, ev) => {
    if (aceitaRef.current(ev, nome, dadosRef.current)) {
      qc.invalidateQueries({ queryKey: chaveRef.current, refetchType: 'active' })
    }
  }), [assinar, qc])   // assinatura estável, sem re-registro a cada render

  return { data: q.data, sincronizado, carregando: q.isLoading }
}
```

O padrão de refs vem de um bug real — ver [C-002](CORRECOES.md).

> **Nota de API:** `refetchPage` foi removido no TanStack Query v5. Use `maxPages` no
> `useInfiniteQuery` e `refetchType: 'active'` na invalidação. Ver [C-014](CORRECOES.md).

---

## 5. Atualização otimista

**Degradação:** o usuário espera a resposta HTTP antes de ver o efeito.

```tsx
const [otimista, aplicar] = useOptimistic(itens, (lista, id: string) => lista.filter(i => i.id !== id))

const inativar = (id: string, versao: number) =>
  startTransition(async () => {
    aplicar(id)                                  // some imediatamente
    const r = await alternarStatus(id, versao)   // confirma ou reverte
    if (r?.codigo) toast(mensagem(r.codigo))
  })
```

**A confirmação vem sempre da resposta HTTP, nunca do SSE.** É o que impede que esta
extensão vire dependência da §2. O SSE serve para *outras* abas.

---

## 6. Telemetria de navegador

**Degradação:** o trace começa no BFF, em vez do clique do usuário.

Três garantias na implementação:

```ts
// 1. exportador aponta para o BFF, nunca para o coletor
new OTLPTraceExporter({ url: '/api/otel/v1/traces' })

// 2. traceparent só sai para a mesma origem
new FetchInstrumentation({ propagateTraceHeaderCorsUrls: [] })

// 3. sanitizador ANTES do batch — nada fora da allowlist é exportado
spanProcessors: [new Sanitizador(), new BatchSpanProcessor(exportador)]
```

O proxy `/api/otel/v1/traces` faz o que o navegador não pode garantir: autentica, limita
taxa (60 lotes/min por usuário) e tamanho (256 KB). Isso mantém `connect-src 'self'` na CSP.

O núcleo 8 — trace no servidor — funciona sem esta extensão.

---

## 7. CSP com nonce

**Degradação:** política mais fraca contra XSS; nenhuma funcionalidade muda.

É defesa em profundidade, não controle de acesso. Se fosse controle, seria núcleo.

```ts
// proxy.ts — o nonce precisa estar nos cabeçalhos da REQUISIÇÃO
const headers = new Headers(req.headers)
headers.set('x-nonce', nonce)
headers.set('content-security-policy', csp)      // ← o que o Next lê

const res = NextResponse.next({ request: { headers } })
res.headers.set('content-security-policy', csp)  // ← o que o navegador lê
```

Omitir a CSP nos cabeçalhos da requisição faz a aplicação funcionar em `dev` e quebrar em
produção — ver [C-001](CORRECOES.md).

**Zona pública:** nonce e prerender estático são mutuamente exclusivos. A política ali é
por hash, gerada em build. Ver [ADR-0006](adr/0006-csp-nonce-vs-estatico.md).

**Implantação:** modo relatório por duas semanas antes de bloquear. Toda política estrita
quebra algo imprevisto.

---

## 8. Checklist: isto é mesmo uma extensão?

Antes de aceitar qualquer componente novo:

- [ ] Desligá-lo não muda nenhuma resposta HTTP do BFF
- [ ] Desligá-lo não muda nenhuma decisão de autorização
- [ ] Desligá-lo não muda o contrato de erro
- [ ] Nenhum módulo do núcleo o importa
- [ ] Ele não escreve em estrutura lida pelo núcleo
- [ ] **Ele não adiciona significado a um campo já usado pelo núcleo**
- [ ] Existe um parágrafo escrito descrevendo o modo de degradação

O penúltimo item é o que teria pego o cache de payload: ele deu ao `ETag` um segundo
significado — validar representação, além de validar agregado — e os dois eram
incompatíveis.

## 9. Ordem de introdução

Extensões entram **uma por vez**, depois do núcleo em produção, cada uma com seu teste de
remoção.

| Ordem | Extensão | Pré-requisito |
|---|---|---|
| 1 | Tempo real (SSE) | núcleo em produção + teste de caos |
| 2 | Cache de cliente | — |
| 3 | Atualização otimista | — |
| 4 | Telemetria de navegador | — |
| 5 | CSP com nonce | duas semanas em modo relatório |
| 6 | Cache no domínio | **medição de p99 sob ~300 req/s** |

A última só acontece se o número justificar. Sem ele, é especulação.
