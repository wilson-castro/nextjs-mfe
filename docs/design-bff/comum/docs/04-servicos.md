---
doc: 04-servicos
publico: [humano, agente]
pre_requisito: 01-camadas.md
---

# 04 — Serviços: onde cada coisa mora

Onde cada responsabilidade descrita em [01](01-camadas.md) mora no disco.

> **Núcleo em roxo, extensão em cinza.** O que é obrigatório está em
> [02 — Núcleo](02-nucleo.md); o que é opcional, em [03 — Extensões](03-extensoes.md).
> Este documento mostra o layout de arquivos que materializa os dois.

## 1. Mapa de diretórios

```
AGENTS.md
next.config.ts
proxy.ts                          ← CSP + gate de sessão
instrumentation.ts                ← OTel servidor
instrumentation-client.ts         ← OTel navegador (restrito)
otel.node.ts

app/
  (publico)/                      ← root layout próprio, sem sessão, servível de CDN
    layout.tsx  page.tsx  sobre/  contato/  guia-de-uso/[[...secao]]/  login/
  (app)/                          ← root layout próprio, com sessão e stream
    layout.tsx
    _shell/                       Sidebar  Header  BadgeNotificacoes
    error.tsx
    pedidos/  dashboard/  configuracoes/
  _stream/                        StreamProvider  QueryProvider  useRevalidacao
  api/
    auth/[...nextauth]/route.ts
    stream/route.ts               ← SSE multiplexado
    bff/                          ← endpoints para fetch do navegador
    otel/v1/traces/route.ts       ← proxy de telemetria

lib/
  auth.ts          'server-only'  configuração OIDC
  session.ts       'server-only'  sessão e renovação de token
  redis.ts         'server-only'  apenas sessão
  csrf.ts          'server-only'
  rate-limit.ts    'server-only'
  upstream/
    client.ts      'server-only'  transporte HTTP para o domínio
    erros.ts       'server-only'
  pedidos/
    dal.ts         'server-only'  camada de acesso a dados
    tipos.ts
  erros.ts                        ← compartilhado: mapa codigo → mensagem
  permissoes.ts                   ← compartilhado: helper `pode()`
```

## 2. Serviços do BFF

Cada grupo abaixo corresponde a uma caixa roxa do diagrama de arquitetura.

### 2.1 Autenticação — `lib/auth.ts`, `lib/session.ts`

| Responsabilidade | Implementação |
|---|---|
| Fluxo OIDC com PKCE | provider do Auth.js contra o IdP |
| Sessão e cookie opaco | adapter Redis, `strategy: 'database'` |
| Renovação de token | refresh sob lock, transparente ao chamador |
| ~~Derivação do `scopeKey`~~ | removida — não há chave de cache compartilhada |

Expõe: `getSessao()`, `requireSessao()`, `getAccessToken()`.
Todas envoltas em `cache()` do React — dedup por requisição, não cache entre requisições.

### 2.2 Cache — não existe no BFF

Não há `lib/cache.ts`. Ver [ADR-0007](adr/0007-remover-cache-de-payload.md) e
[14 — Variantes X e Y](14-variantes-de-cache.md).

O que existe:

| Mecanismo | Escopo | Onde |
|---|---|---|
| `cache()` do React | uma renderização | dedup na DAL |
| React Query | uma aba | ilhas client, ver [ADR-0005](adr/0005-tanstack-query-com-escopo-limitado.md) |
| Redis | apenas sessão | `lib/session.ts` |

Nenhum compartilha payload entre usuários, e portanto nenhum precisa de `scopeKey`.

### 2.3 Composição de dados — `lib/upstream/client.ts` + `lib/*/dal.ts`

Dois níveis, deliberadamente separados:

| Módulo | Sabe sobre | Não sabe sobre |
|---|---|---|
| `upstream/client.ts` | Bearer, ETag, timeout, normalização de erro | o que é um pedido |
| `pedidos/dal.ts` | pedidos, remessas, blocos, chaves de cache | o que é um token |

**Por que `upstream` e não `spring`:** o nome do módulo não deve vazar a tecnologia do
outro lado. Se o domínio virar Quarkus ou Go, você não renomeia nada. Ver [07](09-convencoes.md).

Uma variante importante do cliente:

```ts
spring<T>(path, init)          // 404 → notFound(), interrompe a árvore
springOpcional<T>(path, init)  // 404 → null, o bloco some e a página continua
```

A segunda existe porque um bloco sensível ausente **não deve derrubar a página inteira**.

#### 2.3.1 O DAL em detalhe

É a única porta pela qual um Server Component busca dados. Existe para que quatro
políticas fiquem num lugar só, em vez de espalhadas por cada componente.

| Política | Se estivesse espalhada |
|---|---|
| Sessão obrigatória antes de qualquer leitura | um componente esquece e vaza |
| Tratamento uniforme de `401`, `403`, `404`, `409` | cada um inventa o seu |
| Dedup dentro da mesma renderização | a mesma busca acontece 4× por página |
| Tipagem do retorno | `any` atravessa a árvore |

Cadeia de dependências — cada nível ignora deliberadamente o de baixo:

```
Server Component
      ↓
lib/pedidos/dal.ts       ← sabe o que é um pedido; não sabe o que é um token
      ↓
lib/upstream/client.ts   ← Bearer, timeout, normalização de erro
      ↓
lib/session.ts           ← sessão e renovação de token
```

```ts
// lib/pedidos/dal.ts
import 'server-only'                  // invariante 3: erro de build se o cliente importar
import { cache } from 'react'
import { requireSessao, getSessao } from '@/lib/session'
import { upstream, upstreamOpcional } from '@/lib/upstream/client'

// cache() do React: dedup DENTRO de uma renderização. Não persiste, não é
// compartilhado entre usuários, não precisa de invalidação nem de escopo.

export const getPedido = cache(async (id: string): Promise<PedidoDTO> => {
  await requireSessao()
  const r = await upstream<PedidoDTO>(`/pedidos/${id}`)
  return r.body!
})

export const getRemessas = cache(async (id: string): Promise<RemessaDTO[]> => {
  await requireSessao()
  const r = await upstream<RemessaDTO[]>(`/pedidos/${id}/remessas`)
  return r.body!
})

// Bloco sensível: 404 vira null, o bloco some e a página continua.
export const getCondicaoComercial = cache(async (id: string): Promise<CondicaoDTO | null> => {
  await requireSessao()
  return upstreamOpcional<CondicaoDTO>(`/pedidos/${id}/condicao-comercial`)
})

export const getListaPedidos = cache(async (filtros: Filtros, pagina: number) => {
  await requireSessao()
  const qs = new URLSearchParams({
    status: filtros.status ?? '', q: filtros.q ?? '',
    pagina: String(pagina), size: '20',
  })
  const r = await upstream<PaginaDTO<PedidoResumoDTO>>(`/pedidos?${qs}`)
  return r.body!
})

// requireSessao() chama redirect(), que lança. Em Server Action queremos
// devolver { codigo } ao formulário, não redirecionar no meio de um POST.
export async function getPedidoOuNulo(id: string): Promise<PedidoDTO | null> {
  const s = await getSessao()
  if (!s) return null
  return getPedido(id)
}
```

**Pontos não óbvios:**

`cache()` do React **não é** `"use cache"` do Next. Nomes parecidos, mecanismos opostos:

| | `cache()` do React | `"use cache"` do Next |
|---|---|---|
| Escopo | uma renderização | entre requisições e usuários |
| Onde vive | memória do processo | store persistente |
| Risco de vazamento | nenhum | alto — ver [ADR-0003](adr/0003-cache-com-escopo.md) |

O `cache()` resolve um problema concreto: `Cabecalho`, `Itens` e `Relacionados` chamam
`getPedido('8821')` na mesma árvore. Sem ele, três buscas. O `requireSessao()` dentro de
cada função também é deduplicado pelo mesmo mecanismo.

`requireSessao()` vem **antes** de qualquer chamada ao domínio. Ela é o que garante que
nenhuma leitura acontece sem sessão — a política que a DAL existe para centralizar.

**Nenhuma leitura é cacheada no BFF.** O `cache()` do React deduplica dentro de uma
renderização e desaparece quando ela termina. A listagem paginada é cacheada no cliente
pelo React Query, onde o conjunto de combinações é o de um usuário só e não há
compartilhamento entre sessões.

`getPedidoOuNulo` existe por causa do `redirect()`. Duas funções em vez de um flag
booleano, pela regra de [C-004](CORRECOES.md).

**Ao adicionar uma função nova:**

```ts
export const getAlgo = cache(async (id: string) => {
  await requireSessao()                          // 1. sessão sempre primeiro
  const r = await upstream<AlgoDTO>(`/algo/${id}`)
  return r.body!                                 // 2. retorno tipado, nunca any
})
```

Checklist: `server-only` no topo · `cache()` do React · `requireSessao()` antes da
chamada · caminho literal, nunca montado com entrada do cliente ([04 §6.2](06-seguranca.md))
· retorno tipado.

**O que não entra no DAL:**

| Não colocar | Onde vai |
|---|---|
| Formatação de valor, data, moeda | componente |
| Decisão de acesso | domínio |
| Cálculo derivado de negócio | domínio |
| Invalidação de cache | não existe mais — ver [ADR-0007](adr/0007-remover-cache-de-payload.md) |
| Estado de interface | ilha client |

O DAL busca e cacheia. Se há um `if` sobre regra de negócio dentro dele, a regra está
no lugar errado.

### 2.4 Tempo real — `app/api/stream/route.ts`

| Responsabilidade | Implementação |
|---|---|
| Conexão upstream | `fetch` com `Accept: text/event-stream`, token relido a cada tentativa |
| Multiplexação por aba | uma conexão por aba, todos os tópicos no mesmo canal |
| Reconexão | `Last-Event-ID` repassado; intervalo controlado pelo campo `retry:` |
| Re-serialização | allowlist de campos; nada além do contrato atravessa |

Sem cache no BFF, o relay é **apenas repasse**: não invalida nada, não coordena nada.
O `router.refresh()` do cliente re-executa a árvore, que busca no domínio. O evento é
acelerador — sem ele, a tela só ficaria desatualizada até a próxima navegação.

> **Contrato de retomada.** `Last-Event-ID` é enviado pelo navegador, mas
> **o servidor só consegue reenviar eventos que tenha guardado**. Redis Pub/Sub é
> at-most-once: com o subscriber desconectado, a mensagem se perde. E `router.refresh()`
> **não reconcilia** com a fonte de verdade se ele próprio lê um cache que perdeu a
> invalidação. Ver [PENDENCIAS.md](PENDENCIAS.md) §1 — bloqueia produção.

> **Sobre backoff.** A especificação WHATWG define um tempo de reconexão e **permite** que
> o agente adicione atraso, sem exigir. Não assuma "sempre exponencial" nem "nunca".
> O controle confiável é o campo `retry:` enviado pelo servidor.

## 3. Serviços do cliente

### 3.1 `app/_stream/StreamProvider.tsx`

Mantém **uma** `EventSource` para a aba e expõe `{ assinar, sincronizado }`.

Por que centralizado: navegadores limitam conexões HTTP/1.1 por origem a seis.
Uma conexão por bloco travaria a aba e multiplicaria conexões no domínio.

### 3.2 `app/_stream/useRevalidacao.ts`

Casa três mecanismos que sozinhos não bastam:

```
React Query → cache, dedup, staleTime
SSE         → "algo mudou, id X"
Polling     → fallback quando o SSE morre
```

O parâmetro `aceita` decide se o evento interessa àquela tela. Sem ele, qualquer
alteração dispararia refetch em todas as abas de todos os usuários.

### 3.3 Ilhas por tela

| Ilha | Existe porque |
|---|---|
| `Filtros` | escreve na URL, precisa de `useTransition` |
| `Lista` | atualização otimista e invalidação seletiva |
| `Timeline` | paginação incremental com scroll preservado |
| `AssinaturaPedido` | traduz evento em `router.refresh()` com debounce |
| `FormPedido` | detecta obsolescência durante a edição |
| `ModalExcluir` | confirmação explícita |

Nenhuma delas recebe DTO sensível. Ver invariante 2 em `AGENTS.md`.

## 4. Inventário de rotas

| Rota | Renderização | Sessão | Cache | Tempo real |
|---|---|---|---|---|
| `/` `/sobre` `/contato` | estática | não | CDN | não |
| `/guia-de-uso/[[...secao]]` | estática, `generateStaticParams` | não | CDN | não |
| `/login` | dinâmica | opcional | — | não |
| `/pedidos` | dinâmica | sim | cliente 30 s | sim |
| `/pedidos/novo` | dinâmica | sim | — | não |
| `/pedidos/[id]` | dinâmica | sim | nenhum | sim |
| `/pedidos/[id]/editar` | dinâmica | sim | — | aviso |
| `/pedidos/[id]/excluir` | dinâmica + intercept | sim | — | sim |
| `/dashboard` | dinâmica, role restrita | sim | nenhum | sim |
| `/configuracoes/[aba]` | dinâmica | sim | — | `sessao.revalidar` |
| `/api/stream` | handler, streaming | sim | — | — |
| `/{zona}/api/bff/*` | handler | sim | `private` | — |
| `/api/otel/v1/traces` | handler | sim | — | — |

**Vocabulário:**

| Termo | Significado |
|---|---|
| Estática | HTML gerado no build, igual para todos, servível de CDN |
| Dinâmica | HTML gerado por requisição; consequência de usar `cookies()`, `headers()` ou `searchParams` |
| Handler | endpoint HTTP (`route.ts`), sem interface |
| Streaming | resposta enviada em partes conforme fica pronta |
| Intercept | rota que renderiza sobre a tela atual, com URL própria |

`export const dynamic = 'force-static'` **não converte** uma rota em estática.
Ele faz o build falhar se algo dinâmico aparecer. É trava, não conversão.

## 5. Serviços externos

| Serviço | Consumido por | Nunca alcançado por |
|---|---|---|
| Provedor SSO | `lib/auth.ts` | navegador (exceto o redirect de login) |
| Redis (sessão) | `lib/session.ts` | navegador |
| API Spring Boot | `lib/upstream/client.ts`, `/api/stream` | navegador |
| Coletor OTel | `otel.node.ts`, `/api/otel/*` | navegador |
| CDN | zona pública | — |

Uma única instância de Redis, só para sessão, com `noeviction` e AOF.
Ver [ADR-0002](adr/0002-redis-como-store-de-sessao.md) e
[ADR-0007](adr/0007-remover-cache-de-payload.md).