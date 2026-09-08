---
doc: 09-convencoes
publico: [humano, agente]
---

# 09 — Convenções de código

## 1. Arquivos do App Router

| Arquivo | Papel |
|---|---|
| `layout.tsx` | shell persistente; não remonta entre navegações irmãs |
| `page.tsx` | único arquivo que torna a rota acessível |
| `loading.tsx` | açúcar para `<Suspense>` em volta da página |
| `error.tsx` | error boundary; exige `'use client'` |
| `not-found.tsx` | alvo de `notFound()` |
| `route.ts` | endpoint HTTP; não coexiste com `page.tsx` no mesmo nível |
| `default.tsx` | fallback de slot paralelo; **obrigatório no Next 16** |

| Pasta | Significado |
|---|---|
| `[id]` | segmento dinâmico |
| `[[...secao]]` | catch-all opcional — casa também com a rota sem segmento |
| `(publico)` | route group; organiza sem afetar a URL |
| `_components` | pasta privada, ignorada pelo roteador |
| `@modal` | slot paralelo, vira prop do layout |
| `(.)excluir` | rota interceptada |

## 2. Nomes de módulo

**Não nomeie módulo pela tecnologia do outro lado.** `spring.ts` é um erro: se o domínio
virar Quarkus, você renomeia tudo ou convive com um arquivo que mente.

```
lib/
  upstream/client.ts    ← transporte; não sabe o que é um pedido
  pedidos/dal.ts        ← domínio; não sabe o que é um Bearer token
```

| Evite | Prefira | Por quê |
|---|---|---|
| `spring.ts` | `upstream/client.ts` | não vaza a stack alheia |
| `api.ts` | `upstream/client.ts` | "api" é ambíguo num BFF |
| `backend.ts` | `upstream/client.ts` | o BFF também é backend |

## 3. Flags booleanos versus funções nomeadas

```ts
// ❌ o nome descreve o mecanismo, não a intenção
spring(path, { naoInterromper: true })

// ✅ intenção legível no ponto de chamada
springOpcional(path)
```

Regra: se o flag muda o **contrato de retorno**, crie outra função.
Se muda apenas comportamento interno, flag serve.

## 4. Fronteira cliente/servidor

`'use client'` é fronteira, não marcador de arquivo. Tudo importado a partir dele entra
no bundle do navegador.

- empurre a fronteira para as folhas da árvore
- passe Server Components como `children` quando precisar aninhar
- nunca passe DTO sensível como prop (ver [04](06-seguranca.md) §3.1)

## 5. Dois root layouts

Não existe `app/layout.tsx`. Existem `app/(publico)/layout.tsx` e `app/(app)/layout.tsx`,
cada um emitindo seu próprio `<html>`.

**Motivo:** o layout autenticado lê `headers()` e abre o `StreamProvider`, o que tornaria
toda página dinâmica — inclusive as que deveriam morar no CDN.

**Efeito colateral:** navegar entre as duas zonas provoca recarga completa. Na prática a
única travessia é `/login → /pedidos`, que já passa por redirect. Se precisar de link do
dashboard para o guia, duplique uma versão autenticada dentro de `(app)`.

## 6. Mudanças do Next 16 que quebram código antigo

| Antes | Agora |
|---|---|
| `params.id` | `const { id } = await params` |
| `cookies()`, `headers()` | assíncronos obrigatoriamente |
| `revalidateTag('x')` | `revalidateTag('x', perfil)` |
| `middleware.ts` | `proxy.ts`, runtime Node |
| slot sem `default.js` | build falha |
| cache por padrão | dinâmico por padrão; cache é opt-in |

Codemod: `npx @next/codemod@canary upgrade latest`

## 7. Tipagem de permissões

```ts
export const ACOES_PEDIDO = ['editar', 'excluir', 'cancelar', 'duplicar'] as const
export type AcaoPedido = typeof ACOES_PEDIDO[number]
export type Permissoes = Readonly<Record<AcaoPedido, boolean>>
```

O `Record` completo faz o compilador cobrar toda ação nova. Um `Partial` permitiria
esquecer uma — e o `pode()` fail-closed esconderia o erro até alguém reclamar.

## 8. Hooks e closures

Handlers registrados em `useEffect` capturam o valor da renderização em que foram
registrados. Se o efeito não depende do valor, use `ref`:

```ts
const dadosRef = useRef(q.data)
useEffect(() => { dadosRef.current = q.data })

useEffect(() => assinar((nome, ev) => {
  if (aceitaRef.current(ev, nome, dadosRef.current)) invalidar()
}), [assinar])   // assinatura estável, sem re-registro a cada render
```

Ver [CORRECOES.md](CORRECOES.md) para o bug real que motivou esta regra.

## 9. Núcleo e extensão

Antes de adicionar qualquer componente, aplique o teste de [03 §8](03-extensoes.md):
desligue-o e verifique se o sistema continua **correto**. Se alguma resposta muda, ele é
núcleo — e precisa ser justificado como tal, não introduzido como conveniência.

O item que mais escapa: **não adicione significado novo a um campo já usado pelo núcleo.**
O `ETag` deste sistema tem um único uso, `If-Match`. Dar a ele um segundo significado foi
o erro que custou mais caro aqui — ver [ADR-0007](adr/0007-remover-cache-de-payload.md).
