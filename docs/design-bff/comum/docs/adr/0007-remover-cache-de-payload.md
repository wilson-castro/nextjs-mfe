# ADR-0007 — Remover o cache de payload do BFF

**Status:** aceita · **Data:** 2026-08 · **Supersede:** [ADR-0003](0003-cache-com-escopo.md)

## Contexto

O ADR-0003 estabeleceu cache explícito em Redis, com `scopeKey` na chave, para payloads
protegidos. A decisão foi correta **para o problema que ela enxergava**: impedir que
`"use cache"` servisse a projeção de um usuário a outro.

Uma auditoria externa e a análise subsequente mostraram que o problema é maior do que a
solução alcança.

## O achado que decide

O payload cacheado contém `_permissoes` — capacidades **calculadas** pelo domínio. Suas
entradas não estão todas capturadas nem pela chave nem pelo validador:

| Entrada de `_permissoes` | Capturada por | Correto? |
|---|---|---|
| Estado do recurso (`FATURADO`) | `versao` → ETag | sim |
| Grupos do usuário | `scopeKey` | sim |
| **Role do usuário** | nada | **não** |
| **Regra temporal** (prazo, janela, vencimento) | nada | **não** |
| **Concessão individual** | nada | **não** |

A dimensão temporal é a mais grave: não depende de ação de ninguém, só do relógio.

### A obsolescência não é limitada pelo TTL

Havia a expectativa de que o TTL fosse teto de inconsistência. **Não é.** O caminho de
`304` renova o frescor e devolve o corpo antigo:

```
t=0     grava { editar: true }, ETag "42"
t=60s   revalida → versão ainda 42 → 304 → estende frescor, devolve corpo velho
t=120s  o prazo de edição venceu; o domínio calcularia editar: false
t=120s  revalida → versão ainda 42 → 304 → estende de novo
t=∞     enquanto houver tráfego, a entrada nunca converge
```

Não é obsolescência de 60 segundos. É indefinida.

### Causa raiz: o validador não valida a representação

A RFC 9110 define o `ETag` como validador da **representação selecionada**. Estávamos
usando um validador do **agregado** (`versao`) para uma representação que varia por
projeção, role e tempo. O `304` mente.

### Conflito adicional entre dois usos do mesmo token

```
ETag: "42"      → cache: precisa variar com a representação
If-Match: "42"  → concorrência: precisa variar com o agregado
```

Requisitos opostos, fundidos num único valor. Corrigir o ETag para o cache quebraria o
`If-Match`: a RFC 9110 exige comparação forte ali, e usuários diferentes passariam a ter
validadores diferentes para a mesma versão do agregado.

## Alternativas

| Opção | Corrige? | Custo |
|---|---|---|
| A — `_permissoes` em endpoint separado | sim | round trip extra por página; payload menos coeso |
| B — validador derivado da resposta (`W/"<hash>"`) | sim | domínio precisa **montar a resposta** para responder `304`; exige token separado para `If-Match` |
| **C — remover o cache de payload** | **elimina** | carga adicional no domínio |

A opção B parece a correção natural, e é onde o raciocínio se fecha:

1. o cache guarda payload projetado, que inclui capacidades calculadas
2. essas capacidades dependem de dimensões fora da chave e do validador
3. corrigir exige validador derivado da resposta
4. isso obriga o domínio a montar a resposta para responder `304`
5. logo o `304` economiza serialização e rede, **não a consulta**
6. e o ganho estimado já era de ~16 ms por página

O que o cache economiza é menor que a corretude que ele exige.

## Decisão

**Remover o cache de payload protegido do BFF.**

Permanece apenas o `cache()` do React — dedup dentro de uma renderização, sem persistência,
sem chave compartilhada, sem invalidação.

```ts
// lib/pedidos/dal.ts — depois
export const getPedido = cache(async (id: string): Promise<PedidoDTO> => {
  await requireSessao()
  const r = await upstream<PedidoDTO>(`/pedidos/${id}`)
  return r.body!
})
```

O `scopeKey` deixa de ter uso e sai de `lib/session.ts`.

## Consequências

**Eliminadas** — não mitigadas, eliminadas:

| O que sai | Era |
|---|---|
| Corrida de cache-aside (stale set) | PENDENCIAS §2 |
| `scopeKey` representa a projeção? | PENDENCIAS §3 |
| Modelo de taxa de acerto sem derivação | PENDENCIAS §6 |
| Índice de chaves de invalidação | C-009 |
| Watermark de geração | proposta de correção |
| `projectionKey` | proposta de correção |
| Invalidação no relay do SSE | complexidade do handler |
| Segunda instância de Redis | ADR-0002 |
| Divergência entre `_permissoes` cacheado e real | este ADR |

**Aceitas:**

- carga no domínio sobe de ~53 para ~267 chamadas/s no modelo, com 2.000 usuários
- ~16 ms a mais por página, na estimativa do doc 06 — que nunca foi medida
- o domínio passa a ser o único ponto de absorção de carga de leitura

**Mantidas sem alteração:**

- projeção no domínio; o BFF continua sem filtrar
- `If-Match` para concorrência otimista — o ETag volta a ter um único uso
- `no-store` no bloco sensível, que já não era cacheado
- `cache()` do React para dedup por requisição
- React Query nas ilhas, com escopo limitado (ADR-0005)

## Verificação obrigatória

Antes do deploy: **p99 do domínio por endpoint sob ~300 req/s** e utilização do pool de
conexões. A média não serve — é a cauda que decide.

Se o domínio sofrer, a resposta **não** é ressuscitar este cache. É cachear **no domínio**,
onde a chave é natural, a projeção é conhecida e as capacidades são recalculadas.

## Comparação lado a lado

As duas variantes estão isoladas em [14 — Variantes X e Y](../14-variantes-de-cache.md),
com o código completo de cada uma e o diagrama `variantes-cache.svg`.

A variante Y ali é a **versão corrigida** do cache — com watermark, `projectionKey` e
validador de representação — não a que estava implementada. Comparar contra a versão
incompleta seria injusto com a decisão que este ADR reverte.

## Quando revisitar

Três condições, em conjunto:

1. medição mostra o domínio como gargalo de leitura
2. o domínio confirma que `_permissoes` depende **apenas** de estado do recurso e grupos
3. o domínio passa a emitir validador da representação, distinto do token de `If-Match`

Sem as três, este ADR permanece.
