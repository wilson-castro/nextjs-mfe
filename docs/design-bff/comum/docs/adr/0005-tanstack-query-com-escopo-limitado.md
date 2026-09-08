# ADR-0005 — TanStack Query apenas nas ilhas, não na aplicação toda

**Status:** aceita · **Data:** 2026-08

## Contexto

Server Components já buscam dados no servidor, sem biblioteca. A pergunta não é
"React Query ou não" — é **onde ele tem escopo**.

## O que o cache do Next não resolve

O cache do framework opera no servidor e por rota. Ele não sabe nada sobre:

- estado que sobrevive à navegação no cliente
- deduplicar duas ilhas pedindo o mesmo dado no navegador
- `staleTime` por chave no cliente
- polling condicional
- paginação incremental com scroll preservado
- invalidação seletiva por chave disparada por evento externo

Concretamente, as necessidades que exigem uma biblioteca:

| Necessidade | Mecanismo |
|---|---|
| Invalidar só a página carregada ao receber SSE | `invalidateQueries({ queryKey })` |
| Timeline com append sem perder scroll | `useInfiniteQuery` + `maxPages` |
| Polling quando o SSE cai | `refetchInterval` condicional |
| Dedup entre badge e painel | cache por `queryKey` |

## Decisão

**RSC busca o que o servidor renderiza. React Query busca só o que o cliente precisa
buscar sozinho. Nunca os dois para o mesmo dado.**

Escopo autorizado:

| Ilha | Justificativa |
|---|---|
| `Lista` | otimismo + invalidação seletiva |
| `Timeline` | paginação incremental |
| `PainelRealtime` | polling de fallback |
| `BadgeNotificacoes` | dedup com o painel |

Escopo proibido: qualquer dado que já venha renderizado por Server Component.

## Por que não na aplicação toda

Duas fontes de verdade para o mesmo dado é o caminho mais curto para bugs de
sincronização — e eles aparecem em produção, não em teste, porque dependem de timing.

Se você buscar o pedido pelo RSC **e** pelo React Query, terá dois valores de `versao`
em memória, e o `If-Match` da mutação pode usar o errado. O sintoma é um `409`
intermitente que ninguém consegue reproduzir.

## Alternativas

| Opção | Quando faria sentido |
|---|---|
| SWR | API menor; falta controle equivalente de paginação incremental |
| Só RSC + `router.refresh()` | se não houvesse fetch client-side; aqui há |
| `useState` + `useEffect` | protótipo; reimplementa cache, retry e corrida — mal |
| RTK Query | se o projeto já usasse Redux; senão arrasta o Redux junto |

## Consequências

- ~13 KB gzipped no bundle
- uma segunda fonte de verdade no cliente, contida pela regra de escopo acima
- `initialData` vindo do RSC evita flash de carregamento nas ilhas


---

## Correção — `refetchPage` não existe no TanStack Query v5

A justificativa original citava `useInfiniteQuery` + `refetchPage`. **`refetchPage` foi
removido no v5**, em favor de `maxPages`.

Isso não derruba a decisão — o escopo limitado do Query continua correto —, mas invalida
essa justificativa específica. A revalidação seletiva de página precisa ser reescrita:

```ts
// ❌ v4, removido
qc.invalidateQueries({ queryKey: chave, refetchPage: (_p, i) => i === 0 })

// ✅ v5 — limita o número de páginas mantidas; refetch atinge as mantidas
useInfiniteQuery({ queryKey: chave, maxPages: 3, /* ... */ })
qc.invalidateQueries({ queryKey: chave, refetchType: 'active' })
```

**Esclarecimento adicional:** `initialData` vindo do RSC significa que o RSC está apenas
*bootstrapando* o cache do Query. Não pode existir uma segunda fonte independente para o
mesmo objeto — é exatamente o que este ADR proíbe.
