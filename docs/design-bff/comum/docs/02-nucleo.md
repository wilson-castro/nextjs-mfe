---
doc: 02-nucleo
publico: [humano, agente]
status: baseline
---

# 02 — Núcleo funcional

Este documento define a **base mínima e completa** do BFF: o que é obrigatório, o que é
extensão, e a regra que impede uma extensão de contaminar o núcleo.

Ele existe porque um problema específico se repetiu. O cache não foi difícil por ser
cache — foi difícil porque **não era uma camada, era um fio atravessando quatro
subsistemas**. Corrigi-lo exigia mexer em sessão, relay do SSE, recuperação e semântica
do `ETag`. Um componente assim não é opcional, ainda que pareça.

Diagrama: [`nucleo-e-extensoes.svg`](nucleo-e-extensoes.svg).

---

## 1. A regra

> **Desligue o componente. O sistema continua correto?**
>
> - **Sim**, só fica mais lento, menos fresco ou menos observável → é **extensão**
> - **Não**, alguma resposta muda ou alguma garantia cai → é **núcleo**, e precisa ser
>   justificado como tal

Uma extensão pode degradar desempenho, frescor, ergonomia e observabilidade.
**Nunca** corretude, autorização, contrato de erro ou consistência.

### Por que o cache reprovou

Quatro acoplamentos, cada um invisível isoladamente:

| Acoplamento | Consequência |
|---|---|
| O relay do SSE invalidava o cache | tempo real dependia de cache |
| `router.refresh()` lia o cache | recuperação dependia de cache |
| `scopeKey` vivia na sessão | sessão dependia de cache |
| `ETag` servia a cache e a `If-Match` | concorrência dependia de decisões de cache |

Desligar o cache mudava o comportamento de recuperação. Logo não era extensão — era
núcleo mal identificado. E como núcleo, não se sustentava.

---

## 2. O núcleo

Oito elementos. Cada um deriva de um requisito, não de conveniência.

| # | Elemento | Requisito de origem |
|---|---|---|
| 1 | Sessão opaca no servidor | credencial fora do navegador |
| 2 | Autorização só no domínio | autoridade única sobre acesso |
| 3 | Composição no servidor | não expor o domínio à internet |
| 4 | Mutação por Server Action com `If-Match` | escrita segura e concorrência |
| 5 | Erro normalizado | não vazar detalhe de implementação |
| 6 | Isolamento `server-only` | fronteira verificável |
| 7 | Allowlist de destino outbound | RFC 10017 |
| 8 | Trace contínuo sem dado pessoal | operabilidade sem PII |

### 2.1 Sessão

```ts
// lib/session.ts
import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'

export type Sessao = { sub: string; roles: string[] }   // sem grupos, sem scopeKey

export const getSessao = cache(async (): Promise<Sessao | null> => {
  const s = await auth()
  return s ? { sub: s.user.sub, roles: s.user.roles ?? [] } : null
})

export const getAccessToken = cache(async (): Promise<string> => {
  const s = await lerSessaoDoCookie()
  if (!s) throw new SessaoInvalida()
  if (Date.now() > s.expiresAt - 30_000) return (await renovar(s)).accessToken
  return s.accessToken
})

export async function requireSessao(): Promise<Sessao> {
  const s = await getSessao()
  if (!s) redirect('/login')
  return s
}
```

**O que saiu:** `scopeKey`. Ele só existia para particionar cache. Sem cache, é peso morto —
e era um conceito que exigia uma premissa nunca demonstrada.

**`roles` fica** porque monta o menu, o que é decisão do cliente sobre si mesmo. **Grupos
não ficam** porque são insumo de autorização, e autorização é do domínio.

### 2.2 Transporte

```ts
// lib/upstream/client.ts
import 'server-only'

const BASE = new URL(process.env.API_BASE_URL!)

type Opcoes = RequestInit & { ifMatch?: string }
type Resposta<T> = { status: number; versao?: string; body?: T }

export async function upstream<T>(path: string, init: Opcoes = {}): Promise<Resposta<T>> {
  // núcleo 7 — nenhuma parte do destino vem do cliente
  if (!path.startsWith('/') || path.startsWith('//')) throw new DestinoInvalido()
  const url = new URL(path, BASE)
  if (url.origin !== BASE.origin) throw new DestinoInvalido()

  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${await getAccessToken()}`)
  headers.set('Accept', 'application/json')
  if (init.body) headers.set('Content-Type', 'application/json')
  if (init.ifMatch) headers.set('If-Match', init.ifMatch)

  const res = await fetch(url, {
    ...init, headers, cache: 'no-store', signal: AbortSignal.timeout(10_000),
  })

  return normalizar<T>(res)
}

// núcleo 5 — um lugar só decide o que cada status significa
async function normalizar<T>(res: Response): Promise<Resposta<T>> {
  if (res.status === 401) throw new SessaoInvalida()          // dispara renovação
  if (res.status === 404) notFound()
  if (res.status === 403) throw new ErroDeAplicacao('OPERACAO_NAO_PERMITIDA')
  if (!res.ok) {
    const b = await res.json().catch(() => ({}))
    if (res.status === 409) throw new Desatualizado(b.codigo, b.supportId, b.campos)
    throw new ErroDeAplicacao(b.codigo ?? 'ERRO_INTERNO', b.supportId)
  }
  return {
    status: res.status,
    versao: res.headers.get('etag') ?? undefined,   // único uso: alimentar o If-Match
    body: res.status === 204 ? undefined : await res.json(),
  }
}

// variante para bloco que pode legitimamente não existir
export async function upstreamOpcional<T>(path: string, init: Opcoes = {}): Promise<T | null> {
  try { return (await upstream<T>(path, init)).body ?? null }
  catch (e) { if (e instanceof NotFound) return null; throw e }
}
```

### 2.3 A DAL

```ts
// lib/pedidos/dal.ts
import 'server-only'
import { cache } from 'react'
import { requireSessao, getSessao } from '@/lib/session'
import { upstream, upstreamOpcional } from '@/lib/upstream/client'

// cache() do React: dedup DENTRO de uma renderização.
// Vive e morre com a requisição. Não é extensão — é detalhe do React.

export const getPedido = cache(async (id: string): Promise<PedidoDTO> => {
  await requireSessao()
  return (await upstream<PedidoDTO>(`/pedidos/${id}`)).body!
})

export const getRemessas = cache(async (id: string): Promise<RemessaDTO[]> => {
  await requireSessao()
  return (await upstream<RemessaDTO[]>(`/pedidos/${id}/remessas`)).body!
})

export const getCondicaoComercial = cache(async (id: string): Promise<CondicaoDTO | null> => {
  await requireSessao()
  return upstreamOpcional<CondicaoDTO>(`/pedidos/${id}/condicao-comercial`)
})

// requireSessao() chama redirect(), que lança. Em Server Action queremos
// devolver { codigo } ao formulário.
export async function getPedidoOuNulo(id: string): Promise<PedidoDTO | null> {
  return (await getSessao()) ? getPedido(id) : null
}
```

### 2.4 Mutação

```ts
// app/(app)/pedidos/[id]/actions.ts
'use server'

export async function excluirPedido(_prev: unknown, fd: FormData) {
  const s = await getSessao()                             // núcleo 4
  if (!s) return { codigo: 'SESSAO_EXPIRADA' }

  const p = schema.safeParse(Object.fromEntries(fd))
  if (!p.success) return { codigo: 'REQUISICAO_INVALIDA' }

  try {
    await upstream(`/pedidos/${p.data.id}`, {
      method: 'DELETE',
      ifMatch: `"${p.data.versao}"`,                      // concorrência otimista
    })
  } catch (e) {
    if (e instanceof ErroDeAplicacao) return { codigo: e.codigo, supportId: e.supportId }
    throw e
  }

  redirect('/pedidos')
}
```

Sem invalidação. Sem coordenação. O domínio recebeu a escrita; a próxima leitura vai ao
domínio e vê o resultado.

### 2.5 Renderização

```tsx
// app/(app)/pedidos/[id]/page.tsx
export default async function Page({ params }) {
  const { id } = await params
  const pedido = await getPedido(id)      // 404 → not-found.tsx

  return (
    <>
      <Cabecalho pedido={pedido} />
      <Itens itens={pedido.itens} />

      <Suspense fallback={<BlocoSkeleton />}>
        <Remessas pedidoId={id} />
      </Suspense>

      <Suspense fallback={null}>
        <CondicaoComercial pedidoId={id} />   {/* null se não autorizado */}
      </Suspense>

      <Acoes id={pedido.id} numero={pedido.numero} permissoes={pedido._permissoes} />
    </>
  )
}
```

### 2.6 Infraestrutura do núcleo

```
Redis        uma instância, apenas sessão, noeviction, AOF
IdP          OIDC, confidential client, PKCE
Domínio      resource server, inalcançável da internet
Coletor      OTLP, recebe do BFF
```

Quatro dependências externas. Nenhuma delas existe por causa de extensão.

---

## 3. As extensões

Cada uma com seu **modo de degradação** — o que exatamente piora se ela for desligada.

### 3.1 Tempo real (SSE)

**Se desligar:** a tela atualiza na navegação, em vez de em ~2 s.

**Contrato de não-contaminação:**

```ts
// o relay é repasse puro — não invalida, não coordena, não decide
for await (const evento of parseSse(upstream.body, abort.signal)) {
  send(formatar(evento))       // allowlist de campos
}
```

O cliente traduz evento em `router.refresh()`, que executa exatamente o mesmo caminho da
navegação. **Nenhum código do núcleo sabe que o SSE existe.**

Regra: se o SSE precisar que algo do núcleo mude de comportamento, ele deixou de ser
extensão. Foi o que aconteceu quando o relay passou a invalidar cache.

**Notificações não são extensão desta.** Elas são estado do domínio, com endpoint próprio
e histórico paginado. O SSE só avisa que chegou algo novo; se o frame se perder, o próximo
`GET /notificacoes` reconcilia.

### 3.2 Cache — no domínio, se necessário

**Se desligar:** mais carga de leitura no domínio. **Nenhuma resposta muda.**

Esta é a extensão mais importante de posicionar corretamente, porque foi a que reprovou
no teste da §1 quando morava no BFF.

**Ela pertence ao domínio.** Lá a chave é natural (`pedido:{id}`), a projeção é conhecida
por quem a calcula, e as capacidades são recalculadas a cada resposta em vez de congeladas.
Nenhuma das três dificuldades sobrevive à mudança de lugar.

Ver [14 — Variantes X e Y](14-variantes-de-cache.md) e
[ADR-0007](adr/0007-remover-cache-de-payload.md).

### 3.3 Cache de cliente (React Query)

**Se desligar:** refetch a cada montagem; scroll e paginação ficam piores.

Escopo autorizado: apenas o que o navegador busca **sozinho** — timeline paginada, painel
de tempo real, autocomplete. Nunca o que o Server Component já trouxe.

Não contamina o núcleo porque vive inteiramente no cliente e não altera nenhuma resposta
do servidor.

### 3.4 Telemetria de navegador

**Se desligar:** o trace começa no BFF, em vez do clique do usuário.

Passa pelo proxy `/api/otel/v1/traces` para autenticação, limite de taxa e tamanho. O
núcleo 8 (trace no servidor) continua funcionando sem ela.

### 3.5 CSP com nonce

**Se desligar:** política mais fraca contra XSS; nenhuma funcionalidade muda.

É segurança em profundidade, não controle de acesso. Se fosse controle, seria núcleo.

### 3.6 Atualização otimista

**Se desligar:** o usuário espera a resposta HTTP antes de ver o efeito.

Vive no `useOptimistic`, no cliente. A confirmação vem sempre da resposta HTTP, nunca do
SSE — é o que impede que a extensão 3.1 vire dependência desta.

---

## 4. Ordem de construção

O núcleo primeiro, inteiro, em produção. Depois extensões, uma por vez, cada uma com seu
teste de remoção.

| Fase | Entrega | Verificação |
|---|---|---|
| 1 | Núcleo 1, 6, 7 — sessão, isolamento, allowlist | `curl` direto ao domínio recusado; build falha se cliente importar `server-only` |
| 2 | Núcleo 2, 3 — autorização e composição | teste de vazamento por ator |
| 3 | Núcleo 4, 5 — mutação e erro | fuzzing sem stacktrace; `409` em `If-Match` velho |
| 4 | Núcleo 8 — observabilidade | trace contínuo, sem PII |
| — | **produção com o núcleo** | p99 do domínio sob carga real |
| 5 | Extensão 3.1 — SSE | desligar e verificar que só o frescor piora |
| 6 | Extensão 3.3, 3.6 — cliente | idem |
| 7 | Extensão 3.5 — CSP | modo relatório por duas semanas antes de bloquear |
| 8 | Extensão 3.2 — cache no domínio, **se a medição da fase 4 justificar** | idem |

A fase 4 termina com um número real. Sem ele, a fase 8 é especulação.

---

## 5. Verificação de que uma extensão é mesmo uma extensão

Antes de aceitar qualquer componente novo:

- [ ] Desligá-lo não muda nenhuma resposta HTTP do BFF
- [ ] Desligá-lo não muda nenhuma decisão de autorização
- [ ] Desligá-lo não muda o contrato de erro
- [ ] Nenhum módulo de `lib/` do núcleo o importa
- [ ] Ele não escreve em estrutura lida pelo núcleo
- [ ] Ele não adiciona significado a um campo já usado pelo núcleo
- [ ] Existe um parágrafo escrito descrevendo o modo de degradação

**O penúltimo item é o que teria pego o cache.** Ele deu ao `ETag` um segundo significado —
validar representação, além de validar agregado — e os dois eram incompatíveis.

---

## 6. O que este núcleo não resolve

Registrado para não passar por completo:

| Lacuna | Onde tratar |
|---|---|
| Lock de renovação depende da política do IdP | [PENDENCIAS.md](PENDENCIAS.md) §4 |
| Limite de taxa contra enumeração sequencial | [PENDENCIAS.md](PENDENCIAS.md) §7 |
| Admission control sob saturação | idem |
| Disponibilidade acoplada à do domínio | consequência aceita do ADR-0007 |
| Teste de caos do SSE antes de produção | fase 5 |

As duas primeiras são as únicas que bloqueiam. Nenhuma exige mudança estrutural.
