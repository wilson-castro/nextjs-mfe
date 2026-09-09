# AGENTS.md

Instruções operacionais para pessoas e agentes de código neste repositório.
Leia este arquivo inteiro antes de escrever qualquer linha. Ele tem precedência sobre
qualquer padrão que você conheça de outros projetos Next.js.

> ⚠️ **Leia [`docs/PENDENCIAS.md`](docs/PENDENCIAS.md) antes de qualquer deploy.**
> Duas pendências continuam abertas e nenhuma exige mudança estrutural.

## O que é este sistema

Front-end Next.js operando como **BFF** sobre uma API Spring Boot. Autenticação por
SSO/OIDC. O navegador nunca recebe credencial.

| Camada | Executa em | Decide |
|---|---|---|
| Cliente | navegador | apenas sobre si mesmo |
| BFF | servidor Node | onde a credencial vive |
| Domínio | JVM | acesso, projeção, regra de negócio |

## A separação que governa tudo

Existem duas classificações ortogonais neste projeto. A primeira é *onde executa*
(as três camadas acima). A segunda é *se é obrigatório*:

> **Desligue o componente. O sistema continua correto?**
>
> - **Sim**, só fica mais lento, menos fresco ou menos observável → **extensão**
> - **Não**, alguma resposta muda ou alguma garantia cai → **núcleo**

O núcleo tem **oito elementos**. Tudo o mais é extensão, com modo de degradação declarado.

Antes de aceitar qualquer componente novo, aplique o teste. Um componente que reprova
mas se apresenta como opcional é a fonte de erro mais cara já registrada aqui — ver
[C-011](docs/CORRECOES.md) e [ADR-0007](docs/adr/0007-remover-cache-de-payload.md).

| | [02 — Núcleo](docs/02-nucleo.md) | [03 — Extensões](docs/03-extensoes.md) |
|---|---|---|
| Sessão opaca no servidor | ✓ | |
| Autorização só no domínio | ✓ | |
| Composição no servidor (RSC + DAL) | ✓ | |
| Mutação por Server Action com `If-Match` | ✓ | |
| Erro normalizado `{ codigo, supportId }` | ✓ | |
| Isolamento `server-only` | ✓ | |
| Allowlist de destino outbound | ✓ | |
| Trace contínuo sem dado pessoal | ✓ | |
| Tempo real (SSE) | | ✓ |
| Cache — **no domínio**, se medição justificar | | ✓ |
| Cache de cliente (React Query) | | ✓ |
| Telemetria de navegador | | ✓ |
| CSP com nonce | | ✓ |
| Atualização otimista | | ✓ |

## Invariantes — nunca viole

Cada item tem verificação em [`docs/11-testes.md`](docs/11-testes.md).
Se não tiver, não é invariante — é intenção.

1. **NUNCA** exponha `access_token`, `refresh_token` ou lista de grupos ao navegador.
2. **NUNCA** passe DTO sensível como prop para componente `'use client'`. O objeto inteiro
   é serializado no payload RSC, inclusive campos não renderizados.
3. **SEMPRE** inclua `import 'server-only'` em módulo que toque credencial ou sessão.
4. **SEMPRE** valide o destino outbound contra `API_BASE_URL`. Nenhuma parte da URL pode
   vir da requisição recebida — exigência da RFC 10017.
5. **SEMPRE** revalide sessão no primeiro bloco de toda Server Action. Ela é endpoint público.
6. **SEMPRE** use `If-Match` em mutação, com a versão que o cliente conhece.
7. Responda **`401`** sem credencial, **`404`** para recurso fora do escopo de grupo,
   **`403`** para ação negada sobre recurso que o usuário legitimamente vê.
8. **NUNCA** renderize placeholder de "sem acesso". Ausência de permissão é ausência de elemento.
9. **NUNCA** confie em `_permissoes` como autorização, e **nunca** recarregue o recurso
   numa Server Action só para reverificá-lo. O domínio decide.
10. **NUNCA** exponha o domínio à internet, e **nunca** crie endpoint no BFF alcançável
    sem cookie de sessão. O único consumidor do BFF é o navegador do próprio usuário.
11. **NUNCA** crie variável `NEXT_PUBLIC_*` com credencial ou endpoint interno.
12. **SEMPRE** normalize erro para `{ codigo, supportId }`. Sem stacktrace, sem nome de classe.
13. **NUNCA** cacheie payload protegido no BFF. Ver ADR-0007.
14. **NUNCA** deixe uma extensão alterar semântica de campo já usado pelo núcleo.

---

## Onde colocar uma busca de dados

Duas perguntas resolvem todos os casos:

1. **Onde a chamada nasce** — no servidor durante a renderização, ou no navegador depois
   que a tela montou?
2. **Ela lê ou escreve?**

Nada aqui distingue "a aplicação" de "o navegador": é tudo a mesma aplicação. O que muda
é o momento do ciclo de vida.

### Caso 1 — A renderização precisa do dado → DAL, no Server Component

```tsx
import { getPedido } from '@/lib/pedidos/dal'

export default async function Page({ params }) {
  const { id } = await params
  const pedido = await getPedido(id)      // ✅ direto, sem HTTP intermediário
  return <Cabecalho pedido={pedido} />
}
```

```tsx
// ❌ ANTIPADRÃO: o servidor faz HTTP para si mesmo
const r = await fetch(`${process.env.AUTH_URL}/api/bff/pedidos/${id}`)
```

O antipadrão custa um round trip completo, perde o `cache()` de dedup do React, e obriga
a reconstruir sessão e cookie manualmente.

### Caso 2 — O usuário aciona algo que muda estado → Server Action

```ts
'use server'

export async function alternarStatus(id: string, versao: number) {
  const s = await getSessao()                    // invariante 5
  if (!s) return { codigo: 'SESSAO_EXPIRADA' }

  try {
    // O domínio é a autoridade. Não recarregue o recurso para reverificar permissão.
    await upstream(`/pedidos/${id}/status`, {
      method: 'PATCH',
      ifMatch: `"${versao}"`,                    // invariante 6
    })
  } catch (e) {
    if (e instanceof ErroDeAplicacao) return { codigo: e.codigo, supportId: e.supportId }
    throw e
  }
  return { ok: true }
}
```

O `<form action={acao}>` funciona **sem JavaScript**: o navegador faz um POST nativo.

### Caso 3 — O navegador busca sozinho, após a montagem → `app/{zona}/api/bff/`

> **Correção (2026-09-09).** O caminho era `app/api/bff/`. Sob Multi-Zones cada zona é
> uma aplicação Next separada e precisa de prefixo de rota exclusivo; duas zonas servindo
> `/api/bff/*` colidem no gateway. O prefixo da zona passa a ser obrigatório —
> `app/pedidos/api/bff/`, `app/estoque/api/bff/`. Mudança de convenção, não de
> configuração. Ver [ADR-0008](docs/adr/0008-multi-zones-como-base-mfe.md) e
> `../mfe/limitações-mfe-multizone.md` item 5.

O teste que decide: **a busca acontece sem navegação?** Se um clique em link ou uma
mudança de `searchParams` resolveria, o caso é 1.

| Exemplo | Por que não é RSC |
|---|---|
| Timeline paginada por cursor | append; recarregar perderia o scroll |
| Scroll infinito | idem |
| Autocomplete com debounce | dezenas de buscas por segundo |
| Verificação de duplicidade ao digitar | valida sem sair do formulário |
| Polling quando o SSE cai | atualização sem interação |
| Bloco pesado em accordion | adiaria o TTFB da página inteira |
| Série de gráfico ao trocar período | a tela é a mesma; só a série muda |

```ts
export async function GET(req: NextRequest) {
  const s = await getSessao()
  if (!s) return NextResponse.json({ codigo: 'NAO_AUTENTICADO' }, { status: 401 })

  // ✅ repasse só o que você reconhece — nunca forward cego de searchParams
  const sp = req.nextUrl.searchParams
  const qs = new URLSearchParams({
    pagina: String(Math.max(1, Number(sp.get('pagina') ?? 1))),
    size: String(Math.min(Number(sp.get('size') ?? 20), 100)),   // teto obrigatório
  })

  const r = await upstream(`/pedidos?${qs}`)
  return NextResponse.json(r.body, { headers: { 'Cache-Control': 'private, no-store' } })
}
```

**Não são Caso 3, embora pareçam:**

| Situação | Onde vai | Por quê |
|---|---|---|
| Dado que o Server Component já trouxe | Caso 1 | duas fontes de verdade — ver ADR-0005 |
| Filtro ou paginação que troca o conjunto | Caso 1, via `searchParams` | estado compartilhável, sobrevive ao refresh |
| Qualquer escrita | Caso 2 | perde progressive enhancement e verificação de origem |
| Upload de arquivo | Caso 2 | é escrita, ainda que o corpo seja binário |

### Caso 4 — A chamada vem de fora da aplicação → **não existe neste sistema**

O BFF tem **um único consumidor: o navegador do próprio usuário**, sempre com cookie de
sessão. Integração externa vai para o domínio, que já é resource server OAuth.

```ts
// ❌ NÃO CRIE ISTO. Contradiz o invariante 10.
// app/api/v1/pedidos/route.ts
export async function POST(req) { await verificarChaveDeServico(req) }
```

Única exceção existente: `/api/public/contato`, chamado pela Server Action da página
pública. Não expõe dado; não deve virar precedente.

### Tabela de decisão

| Origem da chamada | Operação | Onde colocar | Como a sessão chega |
|---|---|---|---|
| Renderização no servidor | leitura | DAL, do Server Component | já resolvida pelo render |
| Ação do usuário na tela | escrita | Server Action | revalidada no corpo da action |
| Código no navegador, após a montagem | leitura | `app/{zona}/api/bff/` | cookie enviado pelo `fetch` |
| Fora da aplicação | qualquer | **não no BFF** — leve ao domínio | — |

**Escrita sempre por Server Action; leitura pela DAL se o servidor renderiza, por Route
Handler se o navegador pede.**

---

## Onde colocar uma verificação de acesso

Quatro pontos de verificação. **Apenas o último é segurança.** Os três primeiros são
experiência de uso e falha rápida — e cada um tem um motivo específico para não resistir
a um `curl`.

| # | Camada | Verifica | Parece segurança porque… | Não é, porque… |
|---|---|---|---|---|
| 1 | `proxy.ts` | presença de cookie | redireciona quem não tem sessão | só olha se o cookie **existe**; um valor forjado passa. Roda em toda requisição, inclusive prefetch — I/O ali multiplicaria carga |
| 2 | layout / DAL | sessão válida, role | consulta o store e dispara `notFound()` | protege a renderização, não o dado. Uma Server Action chamada por `fetch` nunca passa por este layout |
| 3 | condicional de UI | `_permissoes` | o botão some | é HTML. O usuário copia o `id` do formulário e chama a action manualmente |
| 4 | **Domínio** | tudo | — | **é a única que um `curl` não contorna** |

### Por que manter as três primeiras

Elas são a diferença entre uma aplicação usável e uma que erra o tempo todo: a 1 evita
renderizar para quem nem sessão tem; a 2 evita mostrar um dashboard vazio; a 3 evita
oferecer uma ação que vai falhar. Nenhuma **substitui** a camada 4.

### O teste mental

*"Se eu remover esta linha, um atacante consegue o dado?"*
Se **sim**, você está fazendo segurança no lugar errado — mova para o domínio.

### O erro que mais aparece em revisão

```tsx
// ❌ role no lugar de permissão
{sessao.roles.includes('ADMIN') && <BotaoExcluir id={p.id} />}

// ✅ capability vinda do domínio
{pode(p._permissoes, 'excluir') && <BotaoExcluir id={p.id} />}
```

Errado por dois motivos independentes: recria no front uma regra que vive no domínio, e
confunde **role** com **grupo** — um ADMIN de outra região tem a role, não tem o registro.

---

## Índice

| Documento | Quando ler |
|---|---|
| [00 — Caso](docs/00-caso.md) | para ter nomes concretos nos exemplos |
| [01 — Camadas](docs/01-camadas.md) | primeiro contato; fronteiras e autoridade |
| [**02 — Núcleo**](docs/02-nucleo.md) | **antes de escrever código** |
| [**03 — Extensões**](docs/03-extensoes.md) | **antes de propor componente novo** |
| [04 — Serviços](docs/04-servicos.md) | ao procurar onde algo mora |
| [05 — Decisões](docs/05-decisoes.md) | antes de mudança estrutural |
| [06 — Segurança](docs/06-seguranca.md) | ao mexer em sessão, payload ou CSP |
| [07 — Observabilidade](docs/07-observabilidade.md) | ao instrumentar ou investigar |
| [08 — Desempenho](docs/08-desempenho.md) | ao discutir hospedagem ou carga |
| [09 — Convenções](docs/09-convencoes.md) | ao criar arquivo ou nomear módulo |
| [10 — Runbook](docs/10-runbook.md) | quando algo quebra em produção |
| [11 — Testes](docs/11-testes.md) | ao abrir PR |
| [12 — Trilha](docs/12-trilha.md) | onboarding |
| [13 — Glossário](docs/13-glossario.md) | quando um termo não fizer sentido |
| [14 — Variantes de cache](docs/14-variantes-de-cache.md) | se alguém propuser reintroduzir cache |
| [PENDÊNCIAS](docs/PENDENCIAS.md) | **antes de qualquer deploy** |
| [CORREÇÕES](docs/CORRECOES.md) | erros já cometidos; não repita |

## Comandos

```bash
npm ci
npm run dev            # Turbopack
npm run build          # falha se rota pública virar dinâmica
npm run lint
npm run test:vazamento # invariantes 1, 2, 7, 8
npm run test:outbound  # invariante 4
npm run test:e2e       # critérios de aceite
```

## Ao abrir um PR

- [ ] Nenhum invariante violado
- [ ] `test:vazamento` e `test:outbound` passam
- [ ] Toda busca de dados está no lugar previsto pela tabela de decisão
- [ ] Nenhuma verificação das camadas 1–3 usada como se fosse segurança
- [ ] Se adicionou componente, ele passou no teste de extensão ([03 §5](docs/03-extensoes.md))
- [ ] Se mudou decisão estrutural, há ADR nova em `docs/adr/`
- [ ] Se criou rota, ela está em [04 §4](docs/04-servicos.md)
