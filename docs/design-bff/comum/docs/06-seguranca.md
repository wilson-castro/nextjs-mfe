---
doc: 06-seguranca
publico: [humano, agente]
pre_requisito: 02-nucleo.md
---

# 06 — Segurança

## 1. Modelo de ameaça

| Ameaça | Mitigação | Limite |
|---|---|---|
| Exfiltração de token por XSS | token nunca sai do servidor | não impede ação via cookie |
| Enumeração de recursos alheios | `404` em vez de `403` | — |
| Vazamento de bloco sensível no payload | projeção no domínio + regra de props | exige disciplina, não é automático |
| Vazamento pelo canal de tempo real | evento fino, ACL na emissão | — |
| Sobrescrita concorrente | `If-Match` obrigatório | — |
| CSRF em mutação | verificação de origem + `SameSite` | — |
| Injeção de script | CSP estrita com nonce/hash | dependência npm comprometida continua sendo vetor |
| Fingerprinting de framework | erro normalizado, `poweredByHeader: false` | — |
| Enumeração por identificador sequencial | `404` uniforme | **não impede a tentativa**; exige limite de taxa (§2) |
| Exfiltração de token por SSRF no BFF | allowlist outbound rígida (§6.2) | exigência da RFC 10017 |
| Distinção por tempo de resposta | — | **não mitigado**; ver §2 |

## 2. As quatro camadas de verificação

Quatro verificações para a mesma ação. **Só a última é segurança.**

| Camada | Onde | Verifica | Custo | Se falhar |
|---|---|---|---|---|
| 1 | `proxy.ts` | presença de cookie | zero I/O | redirect para login |
| 2 | layout / DAL | sessão válida, role | 1 leitura Redis + 1 ao domínio | `notFound()` |
| 3 | condicional de UI | `_permissoes` | zero | elemento não renderiza |
| 4 | Spring Boot | tudo | query | `404` ou `403` |

As três primeiras existem para dar boa experiência e falhar cedo. Nenhuma delas
resiste a um `curl`.

### Por que a camada 1 não valida o token

O `proxy.ts` roda em **toda** requisição, incluindo prefetch do `<Link>`. Fazer I/O
ali multiplica carga por um fator que depende de quanto o usuário passa o mouse sobre
links. Um cookie forjado passa por essa camada — e tudo bem, a camada 2 pega.

### `401`, `403` ou `404` — o critério

A regra anterior ("sempre `404`, nunca `403`") era ampla demais. **Mascarar com `404` só
compra sigilo quando o chamador não tem outro meio de descobrir que o registro existe.**
Se ele obtém `200` no `GET` do mesmo recurso, devolver `404` no `DELETE` não esconde
nada — só piora a mensagem de erro.

| Situação | Código | Por quê |
|---|---|---|
| Sem credencial válida, token expirado | **401** | não revela nada sobre recurso algum, e é funcionalmente necessário |
| Autenticado, registro fora do escopo de grupo | **404** | a existência *é* o segredo |
| Autenticado, dentro do escopo, ação não permitida | **403** | ele já vê o registro; esconder a existência é impossível e confunde |
| Estado do recurso impede a ação (pedido faturado) | **409/422** | não é autorização, é conflito de estado |

**Por que `401` nunca pode virar `404`.** O loop de reconexão do SSE trata `401` como
retry e relê o token; o `lib/session.ts` renova sob lock em resposta a `401`. Sem esse
sinal, a reconexão vira erro permanente e não há gatilho de renovação.

**Onde o "sempre 404" cobrava o preço.** Um operador do grupo certo, com o pedido
renderizado à frente dele, sem permissão de `excluir`: um `404` no `DELETE` seria mapeado
para "registro não encontrado" — e o vazamento evitado é zero, porque ele acabou de
receber o payload. É o cenário C7, revogação entre o render e o clique.

### Três condições para que o mascaramento por `404` funcione

O `404` só esconde se for **indistinguível de verdade**:

1. **Corpo e cabeçalhos idênticos** nos dois casos. Um `supportId` presente num e ausente
   no outro já diferencia.
2. **Pré-condição avaliada depois da autorização.** Se `GET /pedidos/9999` dá `404` mas
   `DELETE` com `If-Match` errado dá `412`, o `412` confirma existência.
3. **Tempo de resposta comparável.** "Não existe" normalmente retorna antes de "existe mas
   você não pode". Meça a diferença se o sigilo de existência importar de fato.

### Identificadores sequenciais

Os identificadores do caso ilustrativo são sequenciais (`8821`, `PC-2026-8821`). Isso torna
a enumeração trivial de **tentar**. O `404` esconde a resposta; não esconde o padrão de
tentativas.

Consequência: o `404` é **defesa em profundidade, não controle**. Exige limite de taxa por
sessão e por IP nas rotas de leitura de recurso, e alarme sobre taxa anômala de `404`
originada de uma mesma sessão. Nenhum dos dois existe hoje — ver [PENDENCIAS.md](PENDENCIAS.md).

## 3. Regras de payload

### 3.1 A armadilha do payload RSC

O que sai de um Server Component é a **árvore renderizada**, e ela vai no payload RSC.
Isso é seguro para o texto impresso. Mas **props passadas a Client Components são
serializadas e legíveis**.

```tsx
// ❌ o objeto inteiro aparece em self.__next_f.push([...])
<GraficoDeMargem dados={condicao} />

// ✅ apenas strings formatadas atravessam
<GraficoDeMargem serie={condicao.pontos.map(fmtMoeda)} />
```

**Regra:** bloco sensível não alimenta ilha client. Se precisar de interatividade,
renderize os valores já formatados e passe primitivos.

> Nota: a menção a `__NEXT_DATA__` em especificações antigas refere-se ao Pages Router.
> No App Router o vetor equivalente é o flight payload.

### 3.2 Ausência total, sem placeholder

```tsx
export async function CondicaoComercial({ pedidoId }) {
  const condicao = await getCondicaoComercial(pedidoId)   // DAL, nunca upstream direto
  if (!condicao) return null    // não "você não tem acesso"
  return <section>…</section>
}
```

Um placeholder revelaria que o dado existe. A própria existência é informação.

## 4. Barreira de compilação

```ts
import 'server-only'
```

Qualquer Client Component que importe um módulo assim causa **erro de build**, não erro
de runtime. Aplicado obrigatoriamente em: `auth.ts`, `session.ts`, `cache.ts`, `redis.ts`,
`csrf.ts`, `rate-limit.ts`, `upstream/*`, `*/dal.ts`.

## 5. Sessão

| Propriedade | Valor | Razão |
|---|---|---|
| Nome do cookie | `__Host-session` | prefixo força `Secure`, path `/`, sem `Domain` |
| `httpOnly` | `true` | invisível a JavaScript |
| `sameSite` | `lax` | permite o retorno do redirect do SSO |
| Estratégia | `database` | cookie é identificador opaco; token fica no Redis |
| Duração | 8 h | revisar conforme política |

`SameSite=Strict` seria preferível, mas quebraria o callback do SSO. Um endpoint de
callback dedicado permitiria `Strict` no cookie principal — melhoria pendente.

## 6. Mutações

Toda mutação exige três coisas:

1. **Revalidação de sessão** no primeiro bloco. Server Action é endpoint HTTP público.
2. **Validação da entrada** — tudo que vem do formulário é hostil.
3. **`If-Match` com a versão** conhecida pelo cliente.

```ts
export async function excluirPedido(_prev: unknown, fd: FormData) {
  const s = await getSessao()
  if (!s) return { codigo: 'SESSAO_EXPIRADA' }

  const p = schema.safeParse(Object.fromEntries(fd))
  if (!p.success) return { codigo: 'REQUISICAO_INVALIDA' }

  try {
    // O domínio é a autoridade. 403 e 404 já vêm normalizados pelo client.
    await upstreamOpcional(`/pedidos/${p.data.id}`, {
      method: 'DELETE',
      ifMatch: `"${p.data.versao}"`,
    })
  } catch (e) {
    if (e instanceof ErroDeAplicacao) return { codigo: e.codigo, supportId: e.supportId }
    throw e
  }

  await invalidar([`pedido:${p.data.id}:*`, 'pedidos:lista:*'])
  redirect('/pedidos')
}
```

### 6.1 Por que NÃO recarregar o recurso para reverificar permissão

Uma versão anterior deste documento prescrevia recarregar o pedido dentro da action e
checar `_permissoes` antes de chamar o domínio. **Estava errado**, por três motivos:

| Problema | Consequência |
|---|---|
| `getPedido` lia do cache (TTL 60 s) | validava o dado contra ele mesmo. O ADR-0007 removeu o cache, mas a chamada extra segue sem valor: o domínio já recusa |
| `getPedido` chama `notFound()`, que lança | dentro de uma action não produz `{ codigo }`; quebra justo no caso de acesso revogado |
| O domínio já recusa | duplicação, por uma mensagem marginalmente melhor num caso raro |

A verificação de `_permissoes` é **camada 3** e vive na renderização, onde o dado acabou
de chegar — não na action, onde não acrescenta frescor. Ver [C-008](CORRECOES.md).

Exclusão exige adicionalmente confirmação explícita — digitar o número do registro,
não apenas clicar em "sim".

## 6.2 Allowlist de destino outbound

**Exigência normativa da RFC 10017.** Um BFF que possa ser induzido a encaminhar
requisições para um host controlado pelo atacante expõe o `access_token`, porque o
`Authorization: Bearer` é anexado pelo próprio BFF.

Nenhuma parte do destino pode ser influenciada pela requisição recebida:

```ts
// lib/upstream/client.ts
const BASE = new URL(process.env.API_BASE_URL!)      // origem fixa, de ambiente

export async function upstream<T>(path: string, init = {}) {
  // path é sempre um literal do nosso código, nunca vem do cliente
  if (!path.startsWith('/') || path.startsWith('//')) throw new DestinoInvalido()

  const url = new URL(path, BASE)
  if (url.origin !== BASE.origin) throw new DestinoInvalido()   // barra // e ../
  // ...
}
```

Regras derivadas:

- **Nenhuma função da DAL aceita URL, host ou origem como parâmetro.** Recebe identificadores.
- **Nenhum Route Handler repassa `searchParams` cru** para montar caminho upstream.
- **Redirect do IdP validado como caminho relativo** — ver `destinoSeguro()` em `/login`.

Teste correspondente em [09](11-testes.md): fuzzing de `id` com `../`, `//evil.com`,
`http://evil.com` e caracteres codificados, assertando que nenhuma requisição sai do BFF
para origem diferente de `API_BASE_URL`.

## 7. CSRF

Server Actions verificam `Origin`/`Host` nativamente. Route Handlers com mutação
precisam de verificação explícita:

```ts
export async function verificarOrigem() {
  const h = await headers()
  const origin = h.get('origin')
  const host = h.get('x-forwarded-host') ?? h.get('host')
  if (!origin || new URL(origin).host !== host) throw new CsrfError()
}
```

`GET` não precisa — desde que nenhum `GET` mude estado.

## 8. Erros

Nenhuma resposta de erro pode conter stacktrace, nome de classe, `org.springframework.*`,
SQL ou cabeçalho identificando o framework.

```
{ "codigo": "REGISTRO_DESATUALIZADO", "supportId": "0K3F9...", "campos": ["fornecedorId"] }
```

O `supportId` é opaco e resolve para o trace **apenas internamente**. O backend não
devolve `traceresponse` nem `Server-Timing` com `trace-id`.

O front mapeia `codigo` para texto em `lib/erros.ts`. Se o código for desconhecido,
cai em mensagem genérica — nunca exibe o código cru.

## 9. Fail-closed em permissões

### 9.1 O helper

```ts
// lib/permissoes.ts
// SEM 'server-only': usado também nas ilhas client.

/**
 * Fail-closed: ausente, nulo ou não-booleano = negado.
 */
export function pode<P extends Record<string, boolean>>(
  permissoes: P | undefined | null,
  acao: keyof P & string,
): boolean {
  return permissoes?.[acao] === true
}
```

O genérico amarra `acao` a `keyof P`, então erro de digitação vira erro de compilação:

```ts
pode(pedido._permissoes, 'excluir')    // ✅
pode(pedido._permissoes, 'excluirr')   // ❌ erro de tipo
```

Serve qualquer recurso: `pode(remessa._permissoes, 'desvincular')` funciona sem alteração.

### 9.2 Por que `=== true`, e não truthiness

Se o domínio omitir o campo por erro de deploy, ou mandar `null`, a ação fica
desabilitada. O usuário vê um botão a menos e reclama — **falha visível e barata**.

O perigo está na variante que alguém escreveria pensando em "não bloquear por engano":

```ts
return permissoes?.[acao] ?? true      // ❌ falha de deploy vira falha de segurança
```

O `=== true` torna a intenção explícita para quem ler depois.

### 9.3 Tipos: `Record` completo, nunca `Partial`

```ts
// lib/pedidos/tipos.ts
export const ACOES_PEDIDO = ['editar', 'excluir', 'cancelar', 'duplicar'] as const
export type AcaoPedido = typeof ACOES_PEDIDO[number]
export type PermissoesPedido = Readonly<Record<AcaoPedido, boolean>>
```

Com `Record` completo, adicionar `'aprovar'` a `ACOES_PEDIDO` faz falhar todo ponto que
constrói um `PermissoesPedido`, até ser atualizado. Com `Partial`, a ação nova ficaria
silenciosamente ausente — e o fail-closed **esconderia o esquecimento** até alguém
reclamar que o botão não aparece. É o caso em que a proteção mascara o defeito.

### 9.4 O payload, na prática

Operador do grupo responsável, pedido aberto:

```json
{
  "id": "8821",
  "numero": "PC-2026-8821",
  "versao": 42,
  "status": "EM_RISCO",
  "_permissoes": { "editar": true, "excluir": true, "cancelar": true, "duplicar": true }
}
```

Mesmo usuário, mesmo endpoint, após o pedido ser faturado:

```json
{
  "id": "8821",
  "versao": 43,
  "status": "FATURADO",
  "_permissoes": { "editar": false, "excluir": false, "cancelar": false, "duplicar": true }
}
```

Nada muda no front. O `router.refresh()` disparado pelo evento SSE traz o novo payload e
os botões desaparecem sozinhos — sem uma linha de lógica no cliente.

Administrador de outra região, mesmo pedido:

```
HTTP/1.1 404 Not Found
{ "codigo": "RECURSO_NAO_ENCONTRADO", "supportId": "0K3F9…" }
```

Não existe `_permissoes` com tudo `false`. Não existe resposta. Role máxima não concede
acesso a registro de grupo alheio — ver §2.

### 9.5 Uso na interface

```tsx
// app/(app)/pedidos/[id]/_blocos/Acoes.tsx
'use client'
import Link from 'next/link'
import { pode } from '@/lib/permissoes'
import type { PedidoDTO } from '@/lib/pedidos/tipos'

// Só o necessário atravessa a fronteira — não o PedidoDTO inteiro.
type Props = Pick<PedidoDTO, 'id' | 'numero' | '_permissoes'>

export function Acoes(p: Props) {
  return (
    <div role="toolbar" aria-label="Ações do pedido">
      {pode(p._permissoes, 'editar') && <Link href={`/pedidos/${p.id}/editar`}>Editar</Link>}
      {pode(p._permissoes, 'excluir') && (
        <Link href={`/pedidos/${p.id}/excluir`} scroll={false}>Excluir</Link>
      )}
    </div>
  )
}
```

O `Pick` é a aplicação do invariante 2 (§3.1): passar `pedido` inteiro serializaria itens
e relacionados no flight payload, incluindo campos que a barra de ações não usa.

### 9.6 Guarda de contrato em desenvolvimento

Pega divergência entre front e domínio antes de virar comportamento estranho em produção:

```ts
export function assertPermissoes(p: unknown): asserts p is PermissoesPedido {
  if (process.env.NODE_ENV === 'production') return
  for (const acao of ACOES_PEDIDO) {
    if (typeof (p as never)?.[acao] !== 'boolean') {
      console.warn(`[contrato] _permissoes sem "${acao}" — o domínio mudou?`)
    }
  }
}
```

Sem produção, para não transformar divergência de contrato em erro de runtime para o usuário.

## 10. Checklist de release

- [ ] Nenhum token nem lista de grupos no objeto de sessão do cliente
- [ ] `server-only` em todos os módulos da seção 4
- [ ] Nenhum DTO sensível como prop de Client Component
- [ ] Nenhum cache de payload protegido no BFF (ADR-0007); nenhum `"use cache"` com dado por usuário
- [ ] Toda Server Action revalida sessão no primeiro bloco
- [ ] Domínio rejeita requisição sem `Authorization` (testar com `curl`)
- [ ] Domínio inalcançável fora do namespace do BFF
- [ ] Nenhuma variável de credencial com prefixo `NEXT_PUBLIC_`
- [ ] Headers suprimidos nos atributos de span
- [ ] Logs não imprimem `Authorization` nem resposta do endpoint de token
- [ ] `traceresponse` e `Server-Timing` ausentes
- [ ] Rota pública sem `cookies()`/`headers()` (validado por `force-static`)

## 11. Melhorias priorizadas

| Melhoria | Ganho | Esforço |
|---|---|---|
| Rotação de refresh token com detecção de reuso | revoga família inteira ao detectar roubo | baixo (configuração no IdP) |
| CSP por hash na zona pública | elimina a única concessão de `unsafe-inline` | médio (passo de build) |
| `SameSite=Strict` com callback dedicado | reduz superfície de CSRF | médio |
| Sender-constrained tokens (DPoP) | token roubado deixa de funcionar isolado | alto |
| `taintObjectReference` nos DTOs sensíveis | trava em runtime o que hoje depende de disciplina | baixo |
| Limite de taxa por sessão nas leituras de recurso | ataca a enumeração sequencial (§2) | baixo |
| Auditoria de dependências transitivas | ataca o vetor residual mais provável | contínuo |

```ts
// lib/pedidos/dal.ts — defesa em profundidade sobre o invariante 2
import { experimental_taintObjectReference as taint } from 'react'

const c = await springOpcional<CondicaoDTO>(`/pedidos/${id}/condicao-comercial`)
if (c) taint('CondicaoComercial não pode ir para o cliente', c)
```

Não substitui a DAL nem o teste de vazamento — valores derivados ainda escapam —, mas
transforma o erro mais provável em exceção em vez de vazamento silencioso.

As duas primeiras são as de melhor relação custo-benefício e deveriam vir primeiro.
DPoP tem ganho real, mas o custo de integração com o IdP costuma ser subestimado.
