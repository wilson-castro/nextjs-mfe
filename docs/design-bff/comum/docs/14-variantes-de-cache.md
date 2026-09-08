---
doc: 14-variantes
publico: [humano, agente]
relacionado: adr/0007-remover-cache-de-payload.md
---

# 14 — Variantes X e Y: sem e com camada de cache

Duas versões completas da mesma arquitetura, isoladas para comparação. A variante X é a
vigente ([ADR-0007](adr/0007-remover-cache-de-payload.md)); a Y é a supersedida
([ADR-0003](adr/0003-cache-com-escopo.md)), reconstruída aqui **com todas as correções
que ela exigiria para estar correta** — não como estava escrita.

Isso é deliberado: comparar a variante X contra a variante Y *incompleta* seria injusto.
A Y abaixo é a melhor versão possível dela.

Diagrama: [`variantes-cache.svg`](variantes-cache.svg).

---

## 1. Resumo

| | **X — sem cache** | **Y — com cache** |
|---|---|---|
| Passos numa leitura | 5 | 7 |
| Instâncias de Redis | 1 | 2 |
| Módulos em `lib/` | 5 | 7 |
| Usos do `ETag` | 1 (`If-Match`) | 2, com requisitos opostos |
| Invalidação a coordenar | nenhuma | por evento, por mutação, por índice |
| Chamadas/s ao domínio | ~267 | ~53 |
| Latência por página | +16 ms | referência |
| `_permissoes` | sempre fresco | obsoleto por tempo indefinido, se não corrigido |
| Modos de falha exclusivos | — | stale set, projeção divergente, `304` incorreto |

Os números de carga e latência são **estimativas de modelo**, nunca medidos.

---

## 2. Variante X — sem cache

### 2.1 Estrutura

```
lib/
  auth.ts          'server-only'   configuração OIDC
  session.ts       'server-only'   sessão e renovação de token
  redis.ts         'server-only'   apenas sessão
  csrf.ts          'server-only'
  rate-limit.ts    'server-only'
  upstream/
    client.ts      'server-only'   transporte HTTP
    erros.ts       'server-only'
  pedidos/
    dal.ts         'server-only'
    tipos.ts
```

### 2.2 A DAL

```ts
// lib/pedidos/dal.ts
import 'server-only'
import { cache } from 'react'
import { requireSessao, getSessao } from '@/lib/session'
import { upstream, upstreamOpcional } from '@/lib/upstream/client'

// cache() do React: dedup DENTRO de uma renderização.
// Não persiste, não é compartilhado, não precisa de chave nem de invalidação.

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

export const getCondicaoComercial = cache(async (id: string): Promise<CondicaoDTO | null> => {
  await requireSessao()
  return upstreamOpcional<CondicaoDTO>(`/pedidos/${id}/condicao-comercial`)
})
```

### 2.3 O cliente HTTP

```ts
// lib/upstream/client.ts
import 'server-only'
import { getAccessToken } from '@/lib/session'

const BASE = new URL(process.env.API_BASE_URL!)

export async function upstream<T>(path: string, init: RequestInit & {
  ifMatch?: string
} = {}): Promise<{ status: number; etag?: string; body?: T }> {

  // allowlist de destino — exigência da RFC 10017
  if (!path.startsWith('/') || path.startsWith('//')) throw new DestinoInvalido()
  const url = new URL(path, BASE)
  if (url.origin !== BASE.origin) throw new DestinoInvalido()

  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${await getAccessToken()}`)
  headers.set('Accept', 'application/json')
  if (init.ifMatch) headers.set('If-Match', init.ifMatch)   // único uso do ETag

  const res = await fetch(url, {
    ...init, headers, cache: 'no-store', signal: AbortSignal.timeout(10_000),
  })

  if (res.status === 404) notFound()
  if (res.status === 401) throw new SessaoInvalida()        // dispara renovação
  if (res.status === 403) throw new ErroDeAplicacao('OPERACAO_NAO_PERMITIDA')
  if (res.status === 409) { const b = await res.json(); throw new Desatualizado(b.codigo, b.supportId) }
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new ErroDeAplicacao(b.codigo ?? 'ERRO_INTERNO', b.supportId) }

  return {
    status: res.status,
    etag: res.headers.get('etag') ?? undefined,   // repassado só para o If-Match seguinte
    body: res.status === 204 ? undefined : await res.json(),
  }
}
```

### 2.4 O relay do SSE

```ts
// app/api/stream/route.ts — trecho
for await (const evento of parseSse(upstream.body, abort.signal)) {
  if (evento.id) ultimoId = evento.id
  send(formatar(evento))          // repasse puro: não invalida nada
}
```

### 2.5 Redis

```
redis-sessions   maxmemory-policy noeviction   persistência AOF   512 MB
```

Uma instância só.

---

## 3. Variante Y — com cache, corrigida

Reconstrução com todas as correções que ela exigiria. Note quanto de infraestrutura
aparece que não existe na X.

### 3.1 Estrutura

```
lib/
  auth.ts          'server-only'
  session.ts       'server-only'   sessão, renovação E derivação do projectionKey
  redis-sessao.ts  'server-only'   ← instância dedicada
  redis-cache.ts   'server-only'   ← instância dedicada, política oposta
  cache.ts         'server-only'   ← TTL lógico/físico, watermark, índice
  csrf.ts          'server-only'
  rate-limit.ts    'server-only'
  upstream/
    client.ts      'server-only'
    erros.ts       'server-only'
  pedidos/
    dal.ts         'server-only'
    tipos.ts
```

### 3.2 A camada de cache

```ts
// lib/cache.ts
import 'server-only'
import { redisCache } from './redis-cache'

type Entry<T> = { validador: string; body: T; frescoAte: number }

/**
 * Cache-aside com proteção contra stale set.
 *
 * O watermark (`gen:{recurso}`) é lido ANTES da busca no domínio e comparado
 * na gravação. Se a geração avançou nesse intervalo, a gravação é descartada —
 * é isso que impede que uma leitura antiga regrave por cima de uma invalidação.
 */
export async function comCache<T>(
  chave: string,
  recurso: string,
  ttlMs: number,
  buscar: (validador?: string) => Promise<{ status: number; validador?: string; body?: T }>,
): Promise<T> {
  const g0 = await redisCache.get(`gen:${recurso}`)          // watermark
  const entrada = await redisCache.get<Entry<T>>(chave)

  if (entrada && Date.now() < entrada.frescoAte) return entrada.body

  const r = await buscar(entrada?.validador)

  if (r.status === 304 && entrada) {
    // ⚠️ este ramo só é correto se o validador for da REPRESENTAÇÃO.
    // Com validador do agregado, capacidades calculadas nunca convergem.
    entrada.frescoAte = Date.now() + ttlMs
    await gravarSeGeracaoIgual(chave, entrada, recurso, g0, ttlMs * 4)
    return entrada.body
  }

  const nova: Entry<T> = { validador: r.validador!, body: r.body!, frescoAte: Date.now() + ttlMs }
  await gravarSeGeracaoIgual(chave, nova, recurso, g0, ttlMs * 4)
  await redisCache.sAdd(`idx:${recurso}`, chave)             // índice de invalidação
  await redisCache.expire(`idx:${recurso}`, (ttlMs * 4) / 1000)
  return nova.body
}

// Compare-and-set atômico via Lua: só grava se a geração não avançou.
const LUA = `
if redis.call('GET', KEYS[2]) == ARGV[2] then
  return redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[3])
end
return nil`

async function gravarSeGeracaoIgual(chave, valor, recurso, g0, px) {
  await redisCache.eval(LUA, {
    keys: [chave, `gen:${recurso}`],
    arguments: [JSON.stringify(valor), g0 ?? '', String(px)],
  })
}

export async function invalidarRecurso(recurso: string) {
  await redisCache.incr(`gen:${recurso}`)                    // avança o watermark
  const chaves = await redisCache.sMembers(`idx:${recurso}`)
  if (chaves.length) await redisCache.del(...chaves, `idx:${recurso}`)
}
```

### 3.3 A DAL

```ts
// lib/pedidos/dal.ts
export const getPedido = cache(async (id: string): Promise<PedidoDTO> => {
  // projectionKey precisa ser derivável ANTES do lookup, senão o cache não economiza nada
  const { projectionKey } = await requireSessao()

  return comCache<PedidoDTO>(
    `pedido:${id}:${projectionKey}`,
    `pedido:${id}`,                     // recurso, para watermark e índice
    60_000,
    (validador) => upstream<PedidoDTO>(`/pedidos/${id}`, { ifNoneMatch: validador }),
  )
})
```

### 3.4 O contrato exigido do domínio

A variante Y **não funciona sem mudança no domínio**. Três exigências:

```http
GET /pedidos/8821
→ 200 OK
  ETag: W/"42-c1"          ← validador da REPRESENTAÇÃO (versão + projeção)
  X-Aggregate-Version: 42  ← token separado, para o If-Match
  X-Projection: c1         ← derivável na sessão, para montar a chave
```

Sem o `ETag` da representação, o `304` serve capacidades obsoletas. Sem o token separado
de versão, o `If-Match` quebra: usuários com projeções diferentes teriam validadores
diferentes para a mesma versão do agregado, e a RFC 9110 exige comparação forte ali.

### 3.5 O relay do SSE

```ts
for await (const evento of parseSse(upstream.body, abort.signal)) {
  if (evento.id) ultimoId = evento.id
  await invalidarRecurso(`${evento.data.tipo}:${evento.data.id}`)   // ← antes do repasse
  send(formatar(evento))
}
```

Com fan-out por canal, isso precisa acontecer **uma vez por evento**, não uma vez por
conexão — senão vinte usuários do mesmo grupo executam vinte invalidações idênticas.

### 3.6 Redis

```
redis-sessions   maxmemory-policy noeviction    persistência AOF   512 MB
redis-cache      maxmemory-policy allkeys-lru   sem persistência   2 GB
```

Duas instâncias, porque `maxmemory-policy` é por instância. Junto numa só: com
`allkeys-lru`, um pico de cache desloga usuários; com `noeviction`, o cache lotando
derruba as escritas de sessão.

---

## 4. Onde as duas divergem em comportamento

### 4.1 Usuário perde permissão por regra temporal

O prazo de edição vence às 14h00. Ninguém alterou o registro; a `versao` continua 42.

| | X | Y |
|---|---|---|
| 14h00 | próxima leitura vai ao domínio | entrada em cache, `editar: true` |
| 14h01 | `editar: false` | frescor expira → `If-None-Match: "42"` → **304** → estende frescor, devolve `editar: true` |
| 14h30 | `editar: false` | ainda `editar: true` |

Na Y **sem** validador de representação, isso não converge enquanto houver tráfego. É o
achado que motivou o ADR-0007. Com validador de representação (§3.4), converge.

### 4.2 Evento SSE se perde

| | X | Y |
|---|---|---|
| Efeito | tela desatualizada até a próxima navegação | cache mantém o valor antigo por até 60 s |
| Convergência | próxima leitura | expiração do TTL |
| Se `router.refresh()` for chamado | busca no domínio, converge | lê o cache que perdeu a invalidação, **não converge** |

A última linha é a que quebra o argumento "o refresh completo cobre eventos perdidos".

### 4.3 Duas leituras concorrentes com uma mutação

| | X | Y sem watermark | Y com watermark |
|---|---|---|---|
| Resultado | correto sempre | leitura antiga pode regravar após a invalidação | gravação descartada |

### 4.4 Domínio indisponível

| | X | Y |
|---|---|---|
| Leitura falha | sempre | apenas se o cache estiver frio ou stale |

**Este é o único cenário em que Y é melhor.** Ela degrada com mais graça sob falha do
domínio — mas servindo dados possivelmente obsoletos, inclusive capacidades.

---

## 5. Critério de escolha

**Escolha X se:** o domínio aguenta a carga de leitura; capacidades dependem de tempo,
role ou concessão individual; simplicidade operacional vale mais que 16 ms.

**Escolha Y se, e somente se, as três condições valerem:**

1. medição mostra o domínio como gargalo de leitura
2. o domínio confirma que a projeção é função apenas de estado do recurso e grupos
3. o domínio emite validador da representação, distinto do token de `If-Match`

Se a 3 não valer, Y é incorreta. Se a 2 não valer, Y vaza entre classes de autorização.
Se a 1 não valer, Y é complexidade sem contrapartida.

**Escolha atual: X.** As condições 2 e 3 não valem hoje. Ver
[ADR-0007](adr/0007-remover-cache-de-payload.md).

### 5.1 Se X saturar o domínio

Na ordem, e **sem ressuscitar o cache do BFF**:

1. cachear no domínio, onde a chave é natural e a projeção é conhecida
2. reduzir blocos por página, ou carregá-los sob demanda
3. paginar itens e lotes no domínio
4. escalar réplicas do domínio

A opção 1 elimina os três problemas da variante Y de uma vez: o domínio conhece a
projeção, recalcula as capacidades e não precisa de validador negociado com ninguém.
