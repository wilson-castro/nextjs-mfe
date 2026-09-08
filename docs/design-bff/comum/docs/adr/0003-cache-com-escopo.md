> ⛔ **Esta decisão foi revertida.** O cache de payload foi removido do BFF.
> Ver [ADR-0007](0007-remover-cache-de-payload.md).
>
> O que permanece válido deste documento: a análise de por que `"use cache"` é
> perigoso para dado por usuário. O que não permanece: a solução proposta.

# ADR-0003 — Cache explícito com escopo, em vez de `"use cache"`

**Status:** ⛔ SUPERSEDIDA por [ADR-0007](0007-remover-cache-de-payload.md) · **Data:** 2026-08

## Contexto

O Next.js 16 tornou o cache opt-in via `"use cache"` (Cache Components). Todo código
dinâmico executa em request time por padrão. A diretiva gera a chave de cache
automaticamente, a partir dos **argumentos da função**.

Nosso payload é projetado por perfil de acesso: dois usuários pedindo a mesma URL
recebem documentos com conjuntos de campos diferentes.

## O problema

```ts
// ❌ vazamento silencioso entre usuários
async function meusPedidos(id: string) {
  'use cache'
  return api(`/pedidos/${id}`)
}
```

A chave deriva de `id`. O primeiro usuário popula o cache; o segundo lê o payload do
primeiro — inclusive blocos que ele não deveria ver.

```ts
// ❌ credencial no store de cache, e cache inútil
async function meusPedidos(id: string, token: string) {
  'use cache'
  return api(`/pedidos/${id}`, token)
}
```

A chave passa a variar por usuário (taxa de acerto próxima de zero) e o token é gravado
como parte da chave no store.

## Decisão

Para **recurso protegido**: cache explícito em Redis, com o escopo de autorização na chave.

```
pedido:{id}:{scopeKey}
```

Onde `scopeKey` é hash dos grupos do usuário, ordenados. Nenhuma resposta autenticada
é marcada como `public`.

Para **dado global e não sensível** (catálogo público, conteúdo do guia): `"use cache"`
continua adequado e preferível.

## Estrutura da entrada

```ts
type Entry<T> = {
  etag?: string      // para revalidação condicional
  versao: number
  body: T
  frescoAte: number  // TTL LÓGICO
}
// gravada com TTL FÍSICO de 4× o lógico
```

A distinção entre TTL lógico e físico é o ponto não óbvio. Se a entrada expirasse junto
com o frescor, o ETag desapareceria exatamente quando se tornaria útil — e toda
revalidação viraria busca completa.

## Consequências

- toda função de leitura protegida precisa passar por `requireSessao()` antes de montar a chave
- a taxa de acerto é menor que a de um cache global: é o preço de payload por perfil
- a invalidação usa índice por recurso (`SMEMBERS` + `DEL`), não `SCAN`; padrões amplos
  degradam sob carga — prefira chaves explícitas
- este cache é invalidado pelo relay SSE **antes** do evento chegar ao cliente

## Regra verificável

Nenhuma função marcada `"use cache"` pode, direta ou indiretamente, chamar
`getAccessToken()` ou `requireSessao()`. Ver teste em [09](../11-testes.md).
