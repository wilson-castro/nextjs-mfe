# Base MFE Multi-Zones — Fatia 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Erguer a base MFE Multi-Zones somente leitura em que o cenário C1 de `00-caso.md` passa — quatro atores abrem `/pedidos/8821` e recebem quatro resultados distintos, com a credencial nunca chegando ao navegador.

**Architecture:** Cinco repositórios independentes em `repos/`. `@erp/contratos` e `@erp/nucleo` são publicados num Verdaccio local e consumidos por `erp-shell` (gateway, sessão, rewrites) e `erp-mfe-pedidos` (zona `/pedidos/*`). O núcleo se divide em `portas/` (três interfaces), `adaptadores/` (implementações trocáveis), `fabricas/` (superfície pública) e `interno/` (concreto, inalcançável de fora). `erp-dominio-stub` serve o caso e faz a projeção por ator.

**Tech Stack:** Node 24.7, pnpm 11, Next 16 (App Router, Turbopack), React 19, TypeScript 5, Verdaccio, `node:test`.

## Global Constraints

- **Node 24.7+, pnpm 11+.** Nenhuma outra versão foi verificada.
- **O pnpm 11 edita o `pnpm-workspace.yaml` sozinho ao instalar um pacote recém-publicado.**
  Ele acrescenta um bloco `minimumReleaseAgeExclude` com o pacote e a versão, e segue. É
  proteção de supply-chain contra pacote publicado há poucos minutos — que é exatamente o
  caso de `@erp/contratos` e `@erp/nucleo` vindos do Verdaccio local. **Não é desvio do
  implementador e não deve ser revertido:** o arquivo commitado vai divergir do que este
  plano mostra, e isso é esperado.
- **Cada sub-repo carrega um `pnpm-workspace.yaml` com `packages: []`.** Sem ele, o
  `pnpm-workspace.yaml` do repositório externo captura o `pnpm install` e as dependências
  vão para o `node_modules` de fora — o pacote parece instalado e não está. O arquivo diz
  a verdade da decisão de multi-repo: cada repositório é raiz de workspace própria.
- **Next 16.** O arquivo de middleware chama-se `proxy.ts` no Next 16 — é o nome usado em todos os documentos. Não crie `middleware.ts`.
- **Registry:** Verdaccio em `http://localhost:4873`, escopo `@erp`. Ordem de publicação sempre **contratos → nucleo → consumidores**.
- **Portas de rede:** 3000 shell, 3001 zona pedidos, 4000 stub, 4873 verdaccio.
- **Testes:** `node --test test/*.test.mjs` sobre arquivos que importam de `dist/`.
  **Não instale framework de teste.** O glob não é estilo: em Node 24.7 o argumento de
  diretório (`node --test test/`) reporta `fail 1` sem executar arquivo nenhum, e ainda
  assim sai com código 0 — falha silenciosa, verificada num projeto limpo.
- **Instalações:** as únicas dependências deste plano são `next`, `react`, `react-dom`, `typescript`, `@types/*` e `verdaccio` (via `pnpm dlx`, sem instalar). Qualquer pacote além destes exige aprovação antes.
- **A fatia 1 é somente leitura.** Nenhuma Server Action, nenhuma rota de mutação, nenhum `If-Match`. `PortaDeDados` expõe apenas leitura — a restrição é estrutural, não de disciplina.
- **Atores do caso:** `gabrigas` (`OPERADOR`, `OPS-NORDESTE`), `marina` (`OPERADOR`, `OPS-NORDESTE` + `COMERCIAL-NORDESTE`), `rafael` (`ADMIN`, `OPS-NORDESTE`), `carla` (`OPERADOR`, `OPS-SUL`).
- **Pedido do caso:** `8821`. `carla` recebe `404`.
- **Ausência total, sem placeholder:** `condicaoComercial` **ausente** do objeto quando não autorizado. Nunca `null`, nunca `undefined` explícito, nunca `{}`.
- **`_permissoes` é `Record` completo, nunca `Partial`.**
- **`exactOptionalPropertyTypes: true` em TODO `tsconfig.json`**, dos pacotes e das apps.
  A ausência de `condicaoComercial` é garantida pelo tsconfig de quem **consome**, não pelo
  `.d.ts` publicado: sem essa flag, um consumidor pode atribuir `condicaoComercial: undefined`
  sem erro de compilação e derrubar o contrato de ausência que o elemento 2 depende.
- Toda pasta `interno/` e todo adaptador começam com `import 'server-only'`. Exceção única: `permissoes/`.

---

## Estrutura de arquivos

```
repos/
  .verdaccio/config.yaml          config do registry local
  scripts/registry.mjs            sobe e derruba o Verdaccio
  erp-contratos/                  @erp/contratos — tipos do caso, códigos de erro
    src/pedido.ts                 PedidoDTO, PermissoesPedido, ACOES_PEDIDO
    src/erros.ts                  CodigoErro, MENSAGENS
    src/index.ts
    test/contratos.test.mjs
  erp-nucleo/                     @erp/nucleo
    src/interno/erros.ts          ErroDeAplicacao e subclasses, normalizar()
    src/interno/upstream.ts       resolverDestino() + upstream()
    src/permissoes/index.ts       pode() — isomórfico, sem server-only
    src/portas/dados.ts           PortaDeDados
    src/portas/sessao.ts          StoreDeSessao, SessaoArmazenada
    src/portas/identidade.ts      ProvedorDeIdentidade
    src/adaptadores/dados-http.ts
    src/adaptadores/sessao-arquivo.ts
    src/adaptadores/identidade-dev.ts
    src/fabricas/criarNucleo.ts
    src/fabricas/criarProxy.ts
    src/testing/index.ts          dadosFake, sessaoFake, identidadeFake
    src/index.ts                  superfície pública
    scripts/fronteira.mjs         lint de fronteira entre camadas
    test/*.test.mjs
  erp-dominio-stub/               servidor HTTP do caso, dev-only
    src/atores.mjs                tabela de atores → grupos e roles
    src/pedido-8821.mjs           fixture base, sem projeção
    src/projetar.mjs              projeção por ator
    src/servidor.mjs
    test/*.test.mjs
  erp-shell/                      app demo-erp :3000
    app/login/page.tsx
    app/api/auth/entrar/route.ts
    app/erro-de-zona/page.tsx
    lib/nucleo.ts
    next.config.ts                rewrites e exceções
  erp-mfe-pedidos/                zona /pedidos/* :3001
    proxy.ts
    lib/nucleo.ts
    app/pedidos/[id]/page.tsx
    app/pedidos/[id]/CondicaoComercialBloco.tsx
    next.config.ts                assetPrefix
    test/c1.test.mjs
  scripts/verificar-lockstep.mjs  gate de lockstep (na raiz de cada consumidor)
```

---

### Task 1: Verdaccio e o esqueleto dos repositórios

**Files:**
- Create: `repos/.verdaccio/config.yaml`
- Create: `repos/scripts/registry.mjs`
- Create: `repos/README.md`

**Interfaces:**
- Consumes: nada
- Produces: registry em `http://localhost:4873` aceitando publicação anônima no escopo `@erp`; comandos `node repos/scripts/registry.mjs up|down`

- [ ] **Step 1: Criar a configuração do registry**

`repos/.verdaccio/config.yaml`:

```yaml
storage: ./storage
uplinks:
  npmjs:
    url: https://registry.npmjs.org/
packages:
  '@erp/*':
    access: $all
    publish: $all
    unpublish: $all
  '**':
    access: $all
    proxy: npmjs
log: { type: stdout, format: pretty, level: warn }
```

- [ ] **Step 2: Criar o script que sobe e derruba o registry**

`repos/scripts/registry.mjs`:

```js
import { spawn } from 'node:child_process'
import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = dirname(dirname(fileURLToPath(import.meta.url)))
const pid = join(raiz, '.verdaccio', 'verdaccio.pid')
const acao = process.argv[2]

if (acao === 'up') {
  const p = spawn('pnpm', ['dlx', 'verdaccio', '--config', join(raiz, '.verdaccio', 'config.yaml'),
                            '--listen', '4873'],
                  { detached: true, stdio: 'ignore', cwd: raiz })
  p.unref()
  writeFileSync(pid, String(p.pid))
  console.log(`verdaccio subindo, pid ${p.pid}, http://localhost:4873`)
} else if (acao === 'down') {
  if (!existsSync(pid)) { console.log('nada rodando'); process.exit(0) }
  // O PID gravado é o do wrapper `pnpm dlx`, não o do Verdaccio: são dois
  // processos. `detached: true` torna o wrapper líder do grupo, então o kill
  // NEGATIVO atinge o grupo inteiro. Matar só o PID positivo deixaria o
  // Verdaccio segurando a porta 4873 enquanto o script diz que o derrubou.
  try { process.kill(-Number(readFileSync(pid, 'utf8')), 'SIGTERM') } catch {}
  unlinkSync(pid)
  console.log('verdaccio derrubado')
} else {
  console.error('uso: node repos/scripts/registry.mjs up|down')
  process.exit(1)
}
```

- [ ] **Step 3: Subir o registry e verificar que responde**

Run:
```bash
node repos/scripts/registry.mjs up
sleep 5
curl -sf http://localhost:4873/-/ping && echo REGISTRY_OK
```
Expected: imprime `REGISTRY_OK`. Se falhar, aguarde mais 5 s — o primeiro `pnpm dlx` baixa o Verdaccio.

Verifique também o `down`, que é metade do contrato de ciclo de vida e é fácil de deixar
sem teste:

```bash
node repos/scripts/registry.mjs down
sleep 2
curl -sf http://localhost:4873/-/ping >/dev/null && echo "AINDA NO AR — o down falhou" || echo "DOWN_OK"
node repos/scripts/registry.mjs up && sleep 8   # deixe no ar para as tasks seguintes
```
Expected: `DOWN_OK`, e o registry de volta no ar depois.

- [ ] **Step 4: Registrar o uso no README**

`repos/README.md`:

```markdown
# Repositórios da base MFE

Cada subdiretório é um repositório git independente, registrado como submódulo de
nextjs-mfe. `repos/` é rastreado; só `.verdaccio/storage/` e `.verdaccio/verdaccio.pid`
são ignorados.

    node scripts/registry.mjs up     # sobe o Verdaccio em :4873
    node scripts/registry.mjs down

Ordem de publicação, sempre: erp-contratos -> erp-nucleo -> consumidores.
```

- [ ] **Step 5: Commit**

```bash
git add repos/.verdaccio/config.yaml repos/scripts/registry.mjs repos/README.md
git commit -m "chore: add local Verdaccio registry for the MFE base"
```

Nota: `repos/.verdaccio/storage/` e `repos/.verdaccio/verdaccio.pid` já estão no `.gitignore` da raiz. Se aparecerem em `git status`, reporte como concern em vez de editar o `.gitignore`.

---

### Task 2: `erp-contratos` — os tipos do caso

**Files:**
- Create: `repos/erp-contratos/package.json`
- Create: `repos/erp-contratos/tsconfig.json`
- Create: `repos/erp-contratos/.npmrc`
- Create: `repos/erp-contratos/pnpm-workspace.yaml`
- Create: `repos/erp-contratos/src/pedido.ts`
- Create: `repos/erp-contratos/src/erros.ts`
- Create: `repos/erp-contratos/src/index.ts`
- Test: `repos/erp-contratos/test/contratos.test.mjs`

**Interfaces:**
- Consumes: nada
- Produces: pacote `@erp/contratos@0.1.0` no Verdaccio, exportando os tipos `PedidoDTO`, `ItemDePedido`, `Remessa`, `Fornecedor`, `CondicaoComercial`, `PermissoesPedido`, `AcaoPedido`, `StatusPedido`, `CodigoErro`; e os valores `ACOES_PEDIDO: readonly AcaoPedido[]` e `MENSAGENS: Record<CodigoErro, string>`

- [ ] **Step 1: Inicializar o repositório**

```bash
mkdir -p repos/erp-contratos/src repos/erp-contratos/test
cd repos/erp-contratos && git init -q
```

`repos/erp-contratos/package.json`:

```json
{
  "name": "@erp/contratos",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "pnpm build && node --test test/*.test.mjs",
    "publicar": "pnpm build && pnpm publish --no-git-checks --registry http://localhost:4873"
  },
  "devDependencies": { "typescript": "^5.6.0" },
  "publishConfig": { "registry": "http://localhost:4873" }
}
```

`repos/erp-contratos/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

`repos/erp-contratos/.npmrc`:

```
@erp:registry=http://localhost:4873
```

`repos/erp-contratos/pnpm-workspace.yaml` — **todo sub-repo leva este arquivo, idêntico**:

```yaml
packages: []
```

- [ ] **Step 2: Escrever o teste que falha**

`repos/erp-contratos/test/contratos.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ACOES_PEDIDO, MENSAGENS } from '../dist/index.js'

test('ACOES_PEDIDO cobre exatamente as chaves de PermissoesPedido', () => {
  // `AcaoPedido` deriva de ACOES_PEDIDO, então o compilador já garante que o tipo
  // acompanha a constante. Este teste guarda o outro lado: que este literal de
  // exemplo, usado pelos testes de tipo, não fique para trás da constante.
  const permissoesDeExemplo = {
    editar: false, remover_remessa: false, excluir: false, aprovar: false,
  }
  assert.deepEqual([...ACOES_PEDIDO].sort(), Object.keys(permissoesDeExemplo).sort())
})

test('ACOES_PEDIDO nao tem duplicatas', () => {
  assert.equal(new Set(ACOES_PEDIDO).size, ACOES_PEDIDO.length)
})

test('MENSAGENS cobre todo codigo de erro e nenhuma mensagem vaza detalhe interno', () => {
  const esperados = ['REGISTRO_DESATUALIZADO', 'OPERACAO_NAO_PERMITIDA',
                     'SESSAO_EXPIRADA', 'DESTINO_INVALIDO', 'ERRO_INTERNO']
  assert.deepEqual(Object.keys(MENSAGENS).sort(), esperados.sort())
  for (const [codigo, texto] of Object.entries(MENSAGENS)) {
    assert.equal(typeof texto, 'string', codigo)
    assert.ok(texto.length > 0, codigo)
    for (const proibido of ['java', 'spring', 'SELECT', 'Exception', 'at ']) {
      assert.ok(!texto.includes(proibido), `${codigo} vaza "${proibido}"`)
    }
  }
})
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

Run: `cd repos/erp-contratos && pnpm install && pnpm test`
Expected: FAIL — `Cannot find module '../dist/index.js'`, porque `src/` ainda não existe.

- [ ] **Step 4: Escrever os tipos**

`repos/erp-contratos/src/pedido.ts`:

```ts
export type StatusPedido = 'RASCUNHO' | 'ABERTO' | 'EM_RISCO' | 'FATURADO'

/** Fonte única da lista de ações. Tudo abaixo deriva desta constante. */
export const ACOES_PEDIDO = ['editar', 'remover_remessa', 'excluir', 'aprovar'] as const

/**
 * Derivado da constante, não declarado ao lado dela. Duas listas escritas à mão
 * divergem: adicionar uma ação ao tipo e esquecer a constante não quebraria nada,
 * e uma enumeração desatualizada esconde uma ação da interface pelo mesmo mecanismo
 * silencioso que um `Partial` esconde uma permissão.
 */
export type AcaoPedido = (typeof ACOES_PEDIDO)[number]

/**
 * Record COMPLETO, nunca Partial. Ver 06-seguranca.md §9.3: um Partial permite
 * que uma ação ausente seja lida como `undefined`, e `undefined` é falsy — o que
 * esconde o botão em vez de falhar a compilação quando o contrato muda.
 */
export type PermissoesPedido = Record<AcaoPedido, boolean>

export type Fornecedor = { readonly id: string; readonly nome: string }

export type ItemDePedido = {
  readonly id: string
  readonly descricao: string
  readonly quantidade: number
}

export type Remessa = {
  readonly id: string
  readonly status: 'PREVISTA' | 'EM_TRANSITO' | 'ENTREGUE'
}

/** Bloco sensível. ACL própria no domínio Comercial. */
export type CondicaoComercial = {
  readonly precoNegociado: number
  readonly margem: number
  readonly contrato: string
}

/**
 * `condicaoComercial` é OPCIONAL e deve estar AUSENTE do objeto quando o ator
 * não tem o grupo — nunca `null`, nunca `{}`. Ver 06-seguranca.md §3.2:
 * ausência total, sem placeholder. Um `null` já informa que o bloco existe.
 */
export type PedidoDTO = {
  readonly id: string
  readonly status: StatusPedido
  readonly versao: number
  readonly fornecedor: Fornecedor
  readonly itens: readonly ItemDePedido[]
  readonly remessas: readonly Remessa[]
  readonly condicaoComercial?: CondicaoComercial
  readonly _permissoes: PermissoesPedido
}
```

`repos/erp-contratos/src/erros.ts`:

```ts
export type CodigoErro =
  | 'REGISTRO_DESATUALIZADO'
  | 'OPERACAO_NAO_PERMITIDA'
  | 'SESSAO_EXPIRADA'
  | 'DESTINO_INVALIDO'
  | 'ERRO_INTERNO'

/** Texto público. Nunca nome de classe, SQL, stacktrace ou nome de framework. */
export const MENSAGENS: Record<CodigoErro, string> = {
  REGISTRO_DESATUALIZADO: 'Este registro mudou enquanto você trabalhava nele. Recarregue e tente de novo.',
  OPERACAO_NAO_PERMITIDA: 'Você não pode executar esta operação.',
  SESSAO_EXPIRADA: 'Sua sessão expirou. Entre novamente.',
  DESTINO_INVALIDO: 'Não foi possível concluir a operação.',
  ERRO_INTERNO: 'Não foi possível concluir a operação. Tente de novo em instantes.',
}
```

`repos/erp-contratos/src/index.ts`:

```ts
export * from './pedido.js'
export * from './erros.js'
```

- [ ] **Step 5: Escrever o teste de tipo, que é o único capaz de reprovar**

Este pacote é quase só declaração de tipo, e tipo some em runtime — um teste `.mjs` não
consegue reprovar uma violação de contrato de tipo. Este arquivo consegue: cada
`@ts-expect-error` **quebra a compilação** se o erro que ele espera não acontecer.

`repos/erp-contratos/test/tipos.test-d.ts`:

```ts
import { ACOES_PEDIDO } from '../src/index.js'
import type { PedidoDTO, PermissoesPedido, AcaoPedido } from '../src/index.js'

const base = {
  id: '8821', status: 'ABERTO', versao: 42,
  fornecedor: { id: 'f1', nome: 'Fornecedor Um' },
  itens: [], remessas: [],
  _permissoes: { editar: false, remover_remessa: false, excluir: false, aprovar: false },
} satisfies Omit<PedidoDTO, 'condicaoComercial'>

/** Omitir é a única forma válida de não ter o bloco. */
export const semBloco: PedidoDTO = base

// @ts-expect-error `undefined` explícito quebra a ausência total (exactOptionalPropertyTypes)
export const comUndefined: PedidoDTO = { ...base, condicaoComercial: undefined }

// @ts-expect-error `null` é placeholder, e placeholder já informa que o bloco existe
export const comNull: PedidoDTO = { ...base, condicaoComercial: null }

// @ts-expect-error Record completo: faltar uma chave não compila
export const permissoesIncompletas: PermissoesPedido = { editar: true }

// @ts-expect-error string arbitrária não é ação
export const acaoInventada: AcaoPedido = 'cancelar'

/** A derivação é real: se AcaoPedido deixar de derivar da constante, isto para de compilar. */
export const derivacaoEhReal: readonly AcaoPedido[] = ACOES_PEDIDO
export const cobreTodaAcao: Record<(typeof ACOES_PEDIDO)[number], boolean> =
  {} as PermissoesPedido
```

`repos/erp-contratos/tsconfig.tipos.json`. O `rootDir: "."` sobrescreve o `"src"` herdado:
sem ele, incluir um arquivo de `test/` dispara `TS6059 — File is not under rootDir`, um erro
estrutural que acontece antes de qualquer checagem semântica e que `noEmit` não evita.

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": true,
    "rootDir": "."
  },
  "include": ["src", "test/tipos.test-d.ts"]
}
```

Em `package.json`, o script `test` passa a rodar os dois:

```json
    "test": "pnpm build && tsc -p tsconfig.tipos.json && node --test test/*.test.mjs",
```

- [ ] **Step 6: Provar que o teste de tipo reprova de verdade**

Um `@ts-expect-error` que nunca viu o erro que espera é pior que nenhum teste: ele
**silencia** um erro real. Confirme que cada um está guardando algo:

Run:
```bash
cd repos/erp-contratos
# remove a flag que sustenta a ausência total: o @ts-expect-error de `undefined`
# fica sem erro para esperar, e o tsc reprova a diretiva não usada
sed -i 's/"exactOptionalPropertyTypes": true/"exactOptionalPropertyTypes": false/' tsconfig.json
pnpm exec tsc -p tsconfig.tipos.json; echo "codigo de saida: $?"
sed -i 's/"exactOptionalPropertyTypes": false/"exactOptionalPropertyTypes": true/' tsconfig.json
pnpm exec tsc -p tsconfig.tipos.json; echo "codigo de saida: $?"
```
Expected: primeiro `error TS2578: Unused '@ts-expect-error' directive.` e `codigo de saida: 2`;
depois `codigo de saida: 0`.

- [ ] **Step 7: Rodar tudo e confirmar que passa**

Run: `cd repos/erp-contratos && pnpm test`
Expected: `tsc` silencioso, depois PASS nos 3 testes de runtime.

- [ ] **Step 8: Publicar no Verdaccio**

Run:
```bash
cd repos/erp-contratos
npm config set //localhost:4873/:_authToken "dev" --location project 2>/dev/null || true
pnpm publicar
curl -sf http://localhost:4873/@erp/contratos | head -c 200 && echo " PUBLICADO_OK"
```
Expected: imprime metadados do pacote e `PUBLICADO_OK`.

Se o Verdaccio pedir autenticação, rode `pnpm dlx npm-cli-login -u dev -p dev -e dev@local -r http://localhost:4873` — o config já concede `publish: $all`, então normalmente não é necessário.

- [ ] **Step 9: Commit**

```bash
cd repos/erp-contratos
git add -A && git commit -m "feat: add purchase order contracts for the ERP case"
```

---

### Task 3: `erp-nucleo` — erros normalizados e allowlist outbound

Esta task entrega os elementos 5 (erro normalizado) e 7 (allowlist outbound) do núcleo. Ambos são testáveis sem rede e sem Next, então vêm primeiro.

**Files:**
- Create: `repos/erp-nucleo/package.json`
- Create: `repos/erp-nucleo/tsconfig.json`
- Create: `repos/erp-nucleo/.npmrc`
- Create: `repos/erp-nucleo/pnpm-workspace.yaml`
- Create: `repos/erp-nucleo/src/interno/erros.ts`
- Create: `repos/erp-nucleo/src/interno/upstream.ts`
- Test: `repos/erp-nucleo/test/allowlist.test.mjs`
- Test: `repos/erp-nucleo/test/erros.test.mjs`

**Interfaces:**
- Consumes: `@erp/contratos` — `CodigoErro`
- Produces:
  - `class ErroDeAplicacao extends Error { readonly codigo: CodigoErro; readonly supportId?: string }`
  - `class SessaoInvalida extends ErroDeAplicacao`, `class Desatualizado extends ErroDeAplicacao`, `class DestinoInvalido extends ErroDeAplicacao`, `class NaoEncontrado extends ErroDeAplicacao`
  - `function resolverDestino(base: URL, path: string): URL`
  - `type Resposta<T> = { status: number; versao?: string; body?: T }`
  - `function normalizar<T>(res: Response): Promise<Resposta<T>>`
  - `function upstream<T>(cfg: { base: URL; obterToken: () => Promise<string> }, path: string, init?: RequestInit & { ifMatch?: string }): Promise<Resposta<T>>`

- [ ] **Step 1: Inicializar o repositório**

```bash
mkdir -p repos/erp-nucleo/src/interno repos/erp-nucleo/test repos/erp-nucleo/scripts
cd repos/erp-nucleo && git init -q
```

`repos/erp-nucleo/package.json`:

```json
{
  "name": "@erp/nucleo",
  "version": "0.1.0",
  "type": "module",
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "pnpm build && node --conditions react-server --test test/*.test.mjs",
    "publicar": "pnpm build && pnpm publish --no-git-checks --registry http://localhost:4873"
  },
  "dependencies": { "@erp/contratos": "0.1.0" },
  "peerDependencies": { "next": "^16.0.0", "server-only": "^0.0.1" },
  "devDependencies": { "typescript": "^5.6.0" },
  "publishConfig": { "registry": "http://localhost:4873" }
}
```

`repos/erp-nucleo/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023", "DOM"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

`lib` inclui `DOM` por causa de `Response`, `Headers` e `fetch`.

`repos/erp-nucleo/.npmrc`:

```
@erp:registry=http://localhost:4873
```

`repos/erp-nucleo/pnpm-workspace.yaml`:

```yaml
packages: []
```

- [ ] **Step 2: Escrever os testes de allowlist que falham**

`repos/erp-nucleo/test/allowlist.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolverDestino, DestinoInvalido } from '../dist/interno/upstream.js'

const BASE = new URL('http://localhost:4000')

test('aceita caminho absoluto de mesma origem', () => {
  assert.equal(resolverDestino(BASE, '/pedidos/8821').href, 'http://localhost:4000/pedidos/8821')
})

test('recusa URL absoluta para outro host', () => {
  assert.throws(() => resolverDestino(BASE, 'http://evil.com/x'), DestinoInvalido)
})

test('recusa caminho protocolo-relativo', () => {
  // "//evil.com" resolve para http://evil.com — o vetor de SSRF mais comum
  assert.throws(() => resolverDestino(BASE, '//evil.com/x'), DestinoInvalido)
})

test('recusa barra invertida, que alguns parsers tratam como //', () => {
  assert.throws(() => resolverDestino(BASE, '/\\evil.com/x'), DestinoInvalido)
})

test('recusa caminho relativo', () => {
  assert.throws(() => resolverDestino(BASE, '../evil'), DestinoInvalido)
  assert.throws(() => resolverDestino(BASE, 'pedidos/8821'), DestinoInvalido)
})

test('byte de controle vence os guards de prefixo — so a origem salva', () => {
  // O parser WHATWG remove TAB, CR e LF do input INTEIRO antes de parsear. '/\t/evil.com'
  // passa pelos dois guards de prefixo (o segundo caractere nao e / nem \) e so entao
  // vira '//evil.com'. O unico check que reprova e `url.origin !== base.origin`.
  //
  // Este teste existe para que "simplificar" os guards no futuro nao reintroduza o SSRF
  // com a suite verde.
  for (const ctrl of ['\t', '\r', '\n']) {
    assert.throws(() => resolverDestino(BASE, `/${ctrl}/evil.com/x`), DestinoInvalido,
      `byte de controle ${JSON.stringify(ctrl)} atravessou`)
  }
})

test('travessia para cima nao escapa da origem', () => {
  // normaliza para /evil na MESMA origem, o que e aceitavel: continua no dominio
  assert.equal(resolverDestino(BASE, '/pedidos/../evil').origin, BASE.origin)
})
```

- [ ] **Step 3: Escrever os testes de erro normalizado que falham**

`repos/erp-nucleo/test/erros.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizar, SessaoInvalida, NaoEncontrado, Desatualizado, ErroDeAplicacao }
  from '../dist/interno/erros.js'

const resposta = (status, body, headers = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers })

test('401 vira SessaoInvalida', async () => {
  await assert.rejects(() => normalizar(resposta(401)), SessaoInvalida)
})

test('404 vira NaoEncontrado', async () => {
  await assert.rejects(() => normalizar(resposta(404)), NaoEncontrado)
})

test('403 vira OPERACAO_NAO_PERMITIDA', async () => {
  await assert.rejects(() => normalizar(resposta(403)),
    (e) => e instanceof ErroDeAplicacao && e.codigo === 'OPERACAO_NAO_PERMITIDA')
})

test('409 vira Desatualizado preservando supportId', async () => {
  await assert.rejects(
    () => normalizar(resposta(409, { codigo: 'REGISTRO_DESATUALIZADO', supportId: 'abc' })),
    (e) => e instanceof Desatualizado && e.supportId === 'abc')
})

test('500 com corpo do framework nao vaza detalhe interno', async () => {
  // o dominio pode devolver lixo; o BFF normaliza e nao repassa
  await assert.rejects(
    () => normalizar(resposta(500, {
      message: 'org.springframework.NullPointerException at java.base/...',
    })),
    (e) => e instanceof ErroDeAplicacao
        && e.codigo === 'ERRO_INTERNO'
        && !JSON.stringify({ codigo: e.codigo, supportId: e.supportId }).includes('spring'))
})

test('codigo desconhecido do upstream vira ERRO_INTERNO', async () => {
  // o unico teste do ramo !res.ok nao enviava `codigo`, entao a rejeicao de codigo
  // desconhecido nunca era exercitada — o gate funcionava sem nenhuma protecao de regressao
  for (const codigo of ['ADMIN_OVERRIDE', 'DESTINO_INVALIDO', 42, null, { a: 1 }]) {
    await assert.rejects(
      () => normalizar(resposta(500, { codigo })),
      (e) => e instanceof ErroDeAplicacao && e.codigo === 'ERRO_INTERNO',
      `codigo ${JSON.stringify(codigo)} nao deveria atravessar`)
  }
})

test('supportId hostil e DESCARTADO, nao repassado nem truncado', async () => {
  // supportId e o outro campo que atravessa a fronteira. Sem validacao, o dominio poe
  // aqui o stacktrace que o `codigo` impediu de passar.
  const stacktrace = 'org.springframework.NullPointerException at java.base/Foo.bar(Foo.java:42)'
  await assert.rejects(
    () => normalizar(resposta(500, { supportId: stacktrace })),
    (e) => e.supportId === undefined)

  for (const hostil of [{ nested: 'x' }, 12345, ['a'], 'a'.repeat(65), 'com espaco', '']) {
    await assert.rejects(
      () => normalizar(resposta(500, { supportId: hostil })),
      (e) => e.supportId === undefined, `supportId ${JSON.stringify(hostil)} atravessou`)
  }

  // um id opaco legitimo passa
  await assert.rejects(
    () => normalizar(resposta(409, { supportId: 'a1b2-c3d4' })),
    (e) => e instanceof Desatualizado && e.supportId === 'a1b2-c3d4')
})

test('200 devolve corpo e ETag como versao', async () => {
  const r = await normalizar(resposta(200, { id: '8821' }, { etag: '"42"' }))
  assert.equal(r.status, 200)
  assert.equal(r.versao, '"42"')
  assert.deepEqual(r.body, { id: '8821' })
})
```

- [ ] **Step 4: Rodar os testes e confirmar que falham**

Run: `cd repos/erp-nucleo && pnpm install && pnpm test`
Expected: FAIL — `Cannot find module '../dist/interno/upstream.js'`.

**`--conditions react-server` não é opcional.** O pacote `server-only` resolve para um
módulo que **lança** quando importado fora do grafo de servidor; sob essa condição ele
resolve para um módulo vazio. Sem a flag, todo teste que toque `interno/`, `adaptadores/`
ou `fabricas/` falha com "This module cannot be imported from a Client Component module",
e a mensagem não sugere a causa.

- [ ] **Step 5: Implementar erros e normalização**

`repos/erp-nucleo/src/interno/erros.ts`:

```ts
import 'server-only'
import type { CodigoErro } from '@erp/contratos'

export class ErroDeAplicacao extends Error {
  constructor(readonly codigo: CodigoErro, readonly supportId?: string) {
    super(codigo)
    this.name = new.target.name
  }
}

export class SessaoInvalida extends ErroDeAplicacao {
  constructor(supportId?: string) { super('SESSAO_EXPIRADA', supportId) }
}

export class Desatualizado extends ErroDeAplicacao {
  constructor(supportId?: string) { super('REGISTRO_DESATUALIZADO', supportId) }
}

export class DestinoInvalido extends ErroDeAplicacao {
  constructor() { super('DESTINO_INVALIDO') }
}

/**
 * Recurso ausente OU não autorizado — o domínio devolve `404` nos dois casos, e o
 * front-end não distingue. A zona traduz isto para `notFound()`. Ver 06-seguranca.md §
 * "401, 403 ou 404 — o critério".
 */
export class NaoEncontrado extends ErroDeAplicacao {
  constructor() { super('ERRO_INTERNO') }
}

export type Resposta<T> = { status: number; versao?: string; body?: T }

/**
 * `supportId` é o SEGUNDO campo que atravessa a fronteira de erro, e o único sem lista
 * fechada. Sem esta validação ele é um canal aberto: o domínio põe ali o stacktrace que
 * o `codigo` impediu de passar, e o teste que prova que `message` não vaza continua verde.
 *
 * Um identificador de suporte é opaco e curto. Qualquer coisa que não seja isso é
 * descartada, não truncada — truncar entregaria os primeiros 64 caracteres do stacktrace.
 */
function sanitizarSupportId(v: unknown): string | undefined {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : undefined
}

/** Um lugar só decide o que cada status significa. Nada do corpo do domínio atravessa. */
export async function normalizar<T>(res: Response): Promise<Resposta<T>> {
  if (res.status === 401) throw new SessaoInvalida()
  if (res.status === 404) throw new NaoEncontrado()
  if (res.status === 403) throw new ErroDeAplicacao('OPERACAO_NAO_PERMITIDA')
  if (!res.ok) {
    const b = (await res.json().catch(() => ({}))) as { codigo?: unknown; supportId?: unknown }
    const supportId = sanitizarSupportId(b.supportId)
    if (res.status === 409) throw new Desatualizado(supportId)
    // `DESTINO_INVALIDO` está FORA desta lista de propósito: é código interno do BFF,
    // e o domínio não pode alegar um erro de uma camada que não é a dele.
    const conhecidos: CodigoErro[] = ['REGISTRO_DESATUALIZADO', 'OPERACAO_NAO_PERMITIDA',
                                      'SESSAO_EXPIRADA', 'ERRO_INTERNO']
    const codigo = conhecidos.includes(b.codigo as CodigoErro) ? (b.codigo as CodigoErro) : 'ERRO_INTERNO'
    throw new ErroDeAplicacao(codigo, supportId)
  }
  const etag = res.headers.get('etag')
  const body = (await res.json().catch(() => undefined)) as T | undefined

  // Construído por atribuição, não por literal. Sob `exactOptionalPropertyTypes`,
  // `body?: T` recusa um `T | undefined`: a flag distingue "chave ausente" de "chave
  // presente valendo undefined". É a mesma distinção que sustenta a ausência total do
  // bloco sensível em `@erp/contratos`, então desligá-la aqui para simplificar custaria
  // a garantia lá.
  const resposta: Resposta<T> = { status: res.status }
  if (etag !== null) resposta.versao = etag
  if (body !== undefined) resposta.body = body
  return resposta
}
```

- [ ] **Step 6: Implementar destino e upstream**

`repos/erp-nucleo/src/interno/upstream.ts`:

```ts
import 'server-only'
import { DestinoInvalido, normalizar, type Resposta } from './erros.js'

export { DestinoInvalido }

/**
 * Elemento 7 do núcleo. Nenhuma parte do destino vem do cliente, e o resultado
 * precisa continuar na mesma origem da base. Exigência da RFC 10017.
 */
export function resolverDestino(base: URL, path: string): URL {
  if (!path.startsWith('/')) throw new DestinoInvalido()
  if (path.startsWith('//') || path.startsWith('/\\')) throw new DestinoInvalido()
  let url: URL
  try { url = new URL(path, base) } catch { throw new DestinoInvalido() }
  if (url.origin !== base.origin) throw new DestinoInvalido()
  return url
}

export type OpcoesUpstream = RequestInit & { ifMatch?: string }

export async function upstream<T>(
  cfg: { base: URL; obterToken: () => Promise<string> },
  path: string,
  init: OpcoesUpstream = {},
): Promise<Resposta<T>> {
  const url = resolverDestino(cfg.base, path)
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${await cfg.obterToken()}`)
  headers.set('Accept', 'application/json')
  if (init.body) headers.set('Content-Type', 'application/json')
  if (init.ifMatch) headers.set('If-Match', init.ifMatch)

  const res = await fetch(url, {
    ...init, headers, cache: 'no-store', signal: AbortSignal.timeout(10_000),
  })
  return normalizar<T>(res)
}
```

- [ ] **Step 7: Rodar os testes e confirmar que passam**

Run: `cd repos/erp-nucleo && pnpm test`
Expected: PASS, 12 testes.

Se falhar em `import 'server-only'`, instale-o: `pnpm add -D server-only`. Este pacote não tem código — ele existe só para quebrar o build quando importado de um Client Component.

- [ ] **Step 8: Commit**

```bash
cd repos/erp-nucleo
git add -A && git commit -m "feat: add normalised errors and outbound allowlist"
```

---

### Task 4: `erp-nucleo` — porta de dados, adaptador HTTP e fakes

**Files:**
- Create: `repos/erp-nucleo/src/portas/dados.ts`
- Create: `repos/erp-nucleo/src/adaptadores/dados-http.ts`
- Create: `repos/erp-nucleo/src/testing/index.ts`
- Test: `repos/erp-nucleo/test/dados.test.mjs`

**Interfaces:**
- Consumes: Task 3 — `upstream`, `Resposta`, `NaoEncontrado`; `@erp/contratos` — `PedidoDTO`
- Produces:
  - `interface PortaDeDados { lerPedido(id: string): Promise<{ pedido: PedidoDTO; versao?: string }> }`
  - `type ObterToken = () => Promise<string>`
  - `type FabricaDeDados = (deps: { obterToken: ObterToken }) => PortaDeDados`
  - `function dadosHttp(cfg: { baseUrl: string }): FabricaDeDados`
  - `function dadosFake(pedidos: Record<string, PedidoDTO>): FabricaDeDados` — exportado de `@erp/nucleo/testing`

- [ ] **Step 1: Escrever o teste que falha**

`repos/erp-nucleo/test/dados.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dadosHttp } from '../dist/adaptadores/dados-http.js'
import { dadosFake } from '../dist/testing/index.js'
import { NaoEncontrado } from '../dist/interno/erros.js'

const PEDIDO = {
  id: '8821', status: 'ABERTO', versao: 42,
  fornecedor: { id: 'f1', nome: 'Fornecedor Um' },
  itens: [], remessas: [],
  _permissoes: { editar: false, remover_remessa: false, excluir: false, aprovar: false },
}

test('o fake devolve o pedido sem tocar a rede', async () => {
  const dados = dadosFake({ '8821': PEDIDO })({ obterToken: async () => 'irrelevante' })
  const { pedido } = await dados.lerPedido('8821')
  assert.equal(pedido.id, '8821')
})

test('o fake lanca NaoEncontrado para id ausente', async () => {
  const dados = dadosFake({})({ obterToken: async () => 'x' })
  await assert.rejects(() => dados.lerPedido('9999'), NaoEncontrado)
})

test('o adaptador HTTP envia Bearer e nunca expoe o token no retorno', async () => {
  let autorizacaoVista = null
  const servidor = (await import('node:http')).createServer((req, res) => {
    autorizacaoVista = req.headers.authorization
    res.writeHead(200, { 'content-type': 'application/json', etag: '"42"' })
    res.end(JSON.stringify(PEDIDO))
  })
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r))
  const porta = servidor.address().port

  const dados = dadosHttp({ baseUrl: `http://127.0.0.1:${porta}` })({
    obterToken: async () => 'token-secreto',
  })
  const { pedido, versao } = await dados.lerPedido('8821')

  assert.equal(autorizacaoVista, 'Bearer token-secreto')
  assert.equal(versao, '"42"')
  assert.ok(!JSON.stringify(pedido).includes('token-secreto'))
  servidor.close()
})

test('o adaptador HTTP recusa id que tenta escapar do caminho', async () => {
  const dados = dadosHttp({ baseUrl: 'http://127.0.0.1:4000' })({ obterToken: async () => 'x' })
  // o id vem da URL, portanto do cliente: precisa ser codificado, nunca concatenado cru
  await assert.rejects(() => dados.lerPedido('../../admin'))
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd repos/erp-nucleo && pnpm test`
Expected: FAIL — `Cannot find module '../dist/adaptadores/dados-http.js'`.

- [ ] **Step 3: Escrever a porta**

`repos/erp-nucleo/src/portas/dados.ts`:

```ts
import type { PedidoDTO } from '@erp/contratos'

export type ObterToken = () => Promise<string>

/**
 * Fatia 1 é somente leitura, e a porta declara isso. Acrescentar mutação aqui
 * exige a rodada 2 — elemento 4 do núcleo, com If-Match. Ver ADR-0008.
 */
export interface PortaDeDados {
  lerPedido(id: string): Promise<{ pedido: PedidoDTO; versao?: string }>
}

export type FabricaDeDados = (deps: { obterToken: ObterToken }) => PortaDeDados
```

- [ ] **Step 4: Escrever o adaptador HTTP**

`repos/erp-nucleo/src/adaptadores/dados-http.ts`:

```ts
import 'server-only'
import type { PedidoDTO } from '@erp/contratos'
import type { FabricaDeDados, PortaDeDados } from '../portas/dados.js'
import { upstream } from '../interno/upstream.js'
import { NaoEncontrado } from '../interno/erros.js'

export function dadosHttp(cfg: { baseUrl: string }): FabricaDeDados {
  const base = new URL(cfg.baseUrl)
  return ({ obterToken }): PortaDeDados => ({
    async lerPedido(id) {
      // `id` vem da URL, portanto do cliente. Codificar é obrigatório:
      // concatenar permitiria "../../" atravessar o caminho.
      const r = await upstream<PedidoDTO>({ base, obterToken },
                                          `/pedidos/${encodeURIComponent(id)}`)
      if (!r.body) throw new NaoEncontrado()
      return r.versao === undefined
        ? { pedido: r.body }
        : { pedido: r.body, versao: r.versao }
    },
  })
}
```

- [ ] **Step 5: Escrever os fakes**

`repos/erp-nucleo/src/testing/index.ts`:

```ts
import type { PedidoDTO } from '@erp/contratos'
import type { FabricaDeDados } from '../portas/dados.js'
import { NaoEncontrado } from '../interno/erros.js'

/** Sem rede, sem stub. Para testes que não precisam exercitar HTTP. */
export function dadosFake(pedidos: Record<string, PedidoDTO>): FabricaDeDados {
  return () => ({
    async lerPedido(id) {
      const pedido = pedidos[id]
      if (!pedido) throw new NaoEncontrado()
      return { pedido, versao: `"${pedido.versao}"` }
    },
  })
}
```

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `cd repos/erp-nucleo && pnpm test`
Expected: PASS, 16 testes.

O quarto teste passa porque `encodeURIComponent('../../admin')` vira `..%2F..%2Fadmin`, que resolve para `/pedidos/..%2F..%2Fadmin` — mesma origem, mas o stub devolverá `404`, e o teste só exige que rejeite.

- [ ] **Step 7: Commit**

```bash
cd repos/erp-nucleo
git add -A && git commit -m "feat: add data port, HTTP adapter and test fakes"
```

---

### Task 5: `erp-nucleo` — sessão, identidade e as fábricas

**Files:**
- Create: `repos/erp-nucleo/src/portas/sessao.ts`
- Create: `repos/erp-nucleo/src/portas/identidade.ts`
- Create: `repos/erp-nucleo/src/adaptadores/sessao-arquivo.ts`
- Create: `repos/erp-nucleo/src/adaptadores/identidade-dev.ts`
- Create: `repos/erp-nucleo/src/permissoes/index.ts`
- Create: `repos/erp-nucleo/src/fabricas/criarNucleo.ts`
- Create: `repos/erp-nucleo/src/fabricas/criarProxy.ts`
- Test: `repos/erp-nucleo/test/sessao.test.mjs`
- Test: `repos/erp-nucleo/test/permissoes.test.mjs`

**Interfaces:**
- Consumes: Tasks 3 e 4
- Produces:
  - `type SessaoArmazenada = { sub: string; roles: string[]; accessToken: string; expiraEm: number }`
  - `type Sessao = { sub: string; roles: string[] }` — o que sai para a aplicação, **sem token**
  - `interface StoreDeSessao { ler(id): Promise<SessaoArmazenada|null>; gravar(id, s): Promise<void>; remover(id): Promise<void> }`
  - `interface ProvedorDeIdentidade { autenticar(c: unknown): Promise<SessaoArmazenada|null> }`
  - `function sessaoArquivo(cfg: { dir: string }): StoreDeSessao`
  - `function identidadeDev(): ProvedorDeIdentidade`
  - `function pode(p: PermissoesPedido, acao: AcaoPedido): boolean`
  - `function criarNucleo(cfg): Nucleo` onde `Nucleo = { dados: PortaDeDados; sessao: { atual(): Promise<Sessao|null>; exigir(): Promise<Sessao> }; identidade: ProvedorDeIdentidade; store: StoreDeSessao }`
  - `function criarProxy(cfg: { prefixo: string; rotaLogin: string; nomeDoCookie?: string }): (req: NextRequest) => NextResponse`

**Nota de desenho — por que `sessaoArquivo` e não `sessaoMemoria`:** shell e zona são **dois processos**. Um store em memória no shell é invisível para a zona, e a sessão nunca resolveria. A porta existe exatamente para isso: `sessaoArquivo` é dev-only e some quando `sessaoRedis` entrar na rodada 2, sem tocar em código de aplicação.

**Nota de desenho — por que `criarProxy` não recebe o núcleo:** `06-seguranca.md` §2 exige **zero I/O** na camada 1, que roda em toda requisição, inclusive prefetch de `<Link>`. A fábrica só verifica **presença** de cookie. Um cookie forjado passa aqui — e tudo bem, a camada 2 pega.

- [ ] **Step 1: Escrever os testes que falham**

`repos/erp-nucleo/test/sessao.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sessaoArquivo } from '../dist/adaptadores/sessao-arquivo.js'
import { identidadeDev } from '../dist/adaptadores/identidade-dev.js'
import { criarNucleo } from '../dist/fabricas/criarNucleo.js'
import { dadosFake } from '../dist/testing/index.js'

const dir = mkdtempSync(join(tmpdir(), 'sessao-'))

test('a sessao gravada por um processo e legivel por outro (arquivo, nao memoria)', async () => {
  const a = sessaoArquivo({ dir })
  const b = sessaoArquivo({ dir })   // instancia distinta = outro "processo"
  await a.gravar('sid-1', { sub: 'gabrigas', roles: ['OPERADOR'],
                            accessToken: 'tk', expiraEm: Date.now() + 60_000 })
  const lida = await b.ler('sid-1')
  assert.equal(lida.sub, 'gabrigas')
})

test('identidadeDev autentica os quatro atores do caso', async () => {
  const idp = identidadeDev()
  for (const u of ['gabrigas', 'marina', 'rafael', 'carla']) {
    const s = await idp.autenticar({ usuario: u })
    assert.equal(s.sub, u)
    assert.ok(s.accessToken.length > 0)
  }
  assert.equal(await idp.autenticar({ usuario: 'ninguem' }), null)
})

test('identidadeDev recusa rodar em producao', async () => {
  const antes = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  try { assert.throws(() => identidadeDev(), /producao/i) }
  finally { process.env.NODE_ENV = antes }
})

test('a sessao entregue a aplicacao nao contem token nem grupos', async () => {
  const store = sessaoArquivo({ dir })
  await store.gravar('sid-2', { sub: 'marina', roles: ['OPERADOR'],
                                accessToken: 'token-secreto', expiraEm: Date.now() + 60_000 })
  const nucleo = criarNucleo({
    dados: dadosFake({}),
    sessao: store,
    identidade: identidadeDev(),
    lerCookieDeSessao: async () => 'sid-2',
  })
  const s = await nucleo.sessao.atual()
  assert.deepEqual(Object.keys(s).sort(), ['roles', 'sub'])
  assert.ok(!JSON.stringify(s).includes('token-secreto'))
})

test('sessao expirada e tratada como ausente', async () => {
  const store = sessaoArquivo({ dir })
  await store.gravar('sid-3', { sub: 'carla', roles: [], accessToken: 'tk',
                                expiraEm: Date.now() - 1 })
  const nucleo = criarNucleo({
    dados: dadosFake({}), sessao: store, identidade: identidadeDev(),
    lerCookieDeSessao: async () => 'sid-3',
  })
  assert.equal(await nucleo.sessao.atual(), null)
})
```

`repos/erp-nucleo/test/permissoes.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pode } from '../dist/permissoes/index.js'

test('pode() exige true estrito, nao truthiness', () => {
  assert.equal(pode({ editar: true, remover_remessa: false, excluir: false, aprovar: false }, 'editar'), true)
  assert.equal(pode({ editar: false, remover_remessa: false, excluir: false, aprovar: false }, 'editar'), false)
})

test('valor ausente ou nao booleano e negado — fail closed', () => {
  // 06-seguranca.md §9.2: qualquer coisa que nao seja exatamente `true` nega.
  assert.equal(pode({}, 'editar'), false)
  assert.equal(pode({ editar: 1 }, 'editar'), false)
  assert.equal(pode({ editar: 'true' }, 'editar'), false)
  assert.equal(pode(null, 'editar'), false)
  assert.equal(pode(undefined, 'editar'), false)
})
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `cd repos/erp-nucleo && pnpm test`
Expected: FAIL — módulos de `dist/adaptadores/sessao-arquivo.js` e `dist/permissoes/index.js` ausentes.

- [ ] **Step 3: Escrever as portas**

`repos/erp-nucleo/src/portas/sessao.ts`:

```ts
/** O que fica no servidor. O `accessToken` nunca sai daqui. */
export type SessaoArmazenada = {
  sub: string
  roles: string[]
  accessToken: string
  expiraEm: number
}

/**
 * O que a aplicação enxerga. Sem token e sem grupos: `roles` monta menu, que é
 * decisão do cliente sobre si mesmo; grupos são insumo de autorização, e
 * autorização é do domínio. Ver 02-nucleo.md §2.1.
 */
export type Sessao = { sub: string; roles: string[] }

export interface StoreDeSessao {
  ler(id: string): Promise<SessaoArmazenada | null>
  gravar(id: string, s: SessaoArmazenada): Promise<void>
  remover(id: string): Promise<void>
}
```

`repos/erp-nucleo/src/portas/identidade.ts`:

```ts
import type { SessaoArmazenada } from './sessao.js'

export interface ProvedorDeIdentidade {
  autenticar(credencial: unknown): Promise<SessaoArmazenada | null>
}
```

- [ ] **Step 4: Escrever os adaptadores**

`repos/erp-nucleo/src/adaptadores/sessao-arquivo.ts`:

```ts
import 'server-only'
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import type { StoreDeSessao, SessaoArmazenada } from '../portas/sessao.js'

/**
 * Adaptador de DESENVOLVIMENTO. Existe porque shell e zona são dois processos e
 * um store em memória não atravessa essa fronteira. Substituído por `sessaoRedis`
 * na rodada 2 — ADR-0002. Não use em produção: sem TTL ativo, sem replicação.
 */
export function sessaoArquivo(cfg: { dir: string }): StoreDeSessao {
  mkdirSync(cfg.dir, { recursive: true })
  // o id da sessão nunca vira nome de arquivo cru: evita travessia de caminho
  const arquivo = (id: string) =>
    join(cfg.dir, `${createHash('sha256').update(id).digest('hex')}.json`)

  return {
    async ler(id) {
      const f = arquivo(id)
      if (!existsSync(f)) return null
      try { return JSON.parse(readFileSync(f, 'utf8')) as SessaoArmazenada }
      catch { return null }
    },
    async gravar(id, s) { writeFileSync(arquivo(id), JSON.stringify(s), { mode: 0o600 }) },
    async remover(id) { rmSync(arquivo(id), { force: true }) },
  }
}
```

`repos/erp-nucleo/src/adaptadores/identidade-dev.ts`:

```ts
import 'server-only'
import { randomUUID } from 'node:crypto'
import type { ProvedorDeIdentidade } from '../portas/identidade.js'
import type { SessaoArmazenada } from '../portas/sessao.js'

/** Os quatro atores de 00-caso.md. Grupos ficam no domínio, não na sessão. */
const ATORES: Record<string, { roles: string[] }> = {
  gabrigas: { roles: ['OPERADOR'] },
  marina:   { roles: ['OPERADOR'] },
  rafael:   { roles: ['ADMIN'] },
  carla:    { roles: ['OPERADOR'] },
}

/**
 * Provedor de DESENVOLVIMENTO. Substituído por OIDC na rodada 2. Recusa-se a
 * existir em produção — um IdP que aceita um nome de usuário sem senha não pode
 * subir por engano.
 */
export function identidadeDev(): ProvedorDeIdentidade {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('identidadeDev não roda em producao; use o provedor OIDC')
  }
  return {
    async autenticar(credencial) {
      const usuario = (credencial as { usuario?: unknown })?.usuario
      if (typeof usuario !== 'string') return null
      const ator = ATORES[usuario]
      if (!ator) return null
      return {
        sub: usuario,
        roles: ator.roles,
        accessToken: `dev.${usuario}.${randomUUID()}`,
        expiraEm: Date.now() + 30 * 60_000,
      }
    },
  }
}
```

- [ ] **Step 5: Escrever `pode()`**

`repos/erp-nucleo/src/permissoes/index.ts`:

```ts
// SEM 'server-only': as ilhas 'use client' precisam deste módulo para decidir
// se renderizam um botão. É a única exceção do núcleo, e é deliberada.
import type { AcaoPedido, PermissoesPedido } from '@erp/contratos'

/**
 * Fail closed. `=== true` e não truthiness: um `1`, uma string `"true"` ou uma
 * chave ausente precisam negar. Ver 06-seguranca.md §9.2.
 */
export function pode(
  permissoes: Partial<PermissoesPedido> | null | undefined,
  acao: AcaoPedido,
): boolean {
  return permissoes?.[acao] === true
}
```

- [ ] **Step 6: Escrever as fábricas**

`repos/erp-nucleo/src/fabricas/criarNucleo.ts`:

```ts
import 'server-only'
import type { FabricaDeDados, PortaDeDados } from '../portas/dados.js'
import type { StoreDeSessao, Sessao } from '../portas/sessao.js'
import type { ProvedorDeIdentidade } from '../portas/identidade.js'
import { SessaoInvalida } from '../interno/erros.js'

export type ConfigDoNucleo = {
  dados: FabricaDeDados
  sessao: StoreDeSessao
  identidade: ProvedorDeIdentidade
  /**
   * Injetado em vez de importar `next/headers` aqui: mantém a fábrica testável
   * fora de um contexto de requisição do Next.
   */
  lerCookieDeSessao: () => Promise<string | undefined>
}

export type Nucleo = {
  dados: PortaDeDados
  sessao: { atual(): Promise<Sessao | null>; exigir(): Promise<Sessao> }
  identidade: ProvedorDeIdentidade
  store: StoreDeSessao
}

export function criarNucleo(cfg: ConfigDoNucleo): Nucleo {
  const armazenada = async () => {
    const id = await cfg.lerCookieDeSessao()
    if (!id) return null
    const s = await cfg.sessao.ler(id)
    if (!s) return null
    if (Date.now() >= s.expiraEm) return null   // expirada é ausente
    return s
  }

  const obterToken = async () => {
    const s = await armazenada()
    if (!s) throw new SessaoInvalida()
    return s.accessToken
  }

  return {
    dados: cfg.dados({ obterToken }),
    identidade: cfg.identidade,
    store: cfg.sessao,
    sessao: {
      async atual() {
        const s = await armazenada()
        // projeta: token e qualquer campo futuro ficam para trás
        return s ? { sub: s.sub, roles: s.roles } : null
      },
      async exigir() {
        const s = await this.atual()
        if (!s) throw new SessaoInvalida()
        return s
      },
    },
  }
}
```

`repos/erp-nucleo/src/fabricas/criarProxy.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server'

export type ConfigDoProxy = {
  /** prefixo da zona, ex.: '/pedidos' */
  prefixo: string
  /** para onde mandar quem não tem cookie, ex.: '/login' */
  rotaLogin: string
  nomeDoCookie?: string
}

/**
 * Camada 1 das quatro verificações — e a única que roda em TODA requisição,
 * inclusive prefetch de `<Link>`. Por isso faz ZERO I/O: só olha se o cookie
 * existe. Um cookie forjado passa daqui, e a camada 2 o rejeita.
 * Ver 06-seguranca.md §2.
 */
export function criarProxy(cfg: ConfigDoProxy) {
  const nome = cfg.nomeDoCookie ?? '__Host-session'
  return function proxy(req: NextRequest): NextResponse {
    const nonce = crypto.randomUUID().replaceAll('-', '')

    if (!req.cookies.has(nome)) {
      // Location RELATIVO, de propósito. `NextResponse.redirect` exige URL absoluta e
      // montaria http://localhost:3001/login — a origem da ZONA, que o navegador nunca
      // deve ver. O usuário fala só com o shell. Um Location relativo é válido em HTTP
      // e o navegador o resolve contra o documento atual, que é o shell.
      const destino = `${cfg.rotaLogin}?de=${encodeURIComponent(req.nextUrl.pathname)}`
      return new NextResponse(null, { status: 307, headers: { Location: destino } })
    }

    const headers = new Headers(req.headers)
    headers.set('x-nonce', nonce)
    const res = NextResponse.next({ request: { headers } })
    res.headers.set('Content-Security-Policy',
      `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'; ` +
      `style-src 'self' 'nonce-${nonce}'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`)
    return res
  }
}
```

- [ ] **Step 7: Rodar e confirmar que passa**

Run: `cd repos/erp-nucleo && pnpm test`
Expected: PASS, 23 testes.

- [ ] **Step 8: Commit**

```bash
cd repos/erp-nucleo
git add -A && git commit -m "feat: add session and identity ports with dev adapters and factories"
```

---

### Task 6: `erp-nucleo` — exports restritos e lint de fronteira

Esta task entrega o que sustenta a extensibilidade: as camadas só valem se a fronteira for verificável.

**Files:**
- Create: `repos/erp-nucleo/src/index.ts`
- Modify: `repos/erp-nucleo/package.json` — adicionar `exports`
- Create: `repos/erp-nucleo/scripts/fronteira.mjs`
- Test: `repos/erp-nucleo/test/fronteira.test.mjs`

**Interfaces:**
- Consumes: Tasks 3, 4 e 5
- Produces: pacote `@erp/nucleo@0.1.0` publicado, com exatamente três subpaths — `.`, `./permissoes`, `./testing`

- [ ] **Step 1: Escrever o teste de exports que falha**

`repos/erp-nucleo/test/fronteira.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

test('o pacote publica exatamente tres subpaths', () => {
  assert.deepEqual(Object.keys(pkg.exports).sort(), ['.', './permissoes', './testing'])
})

test('interno e adaptadores nao sao alcancaveis de fora', () => {
  // se algum dia alguem adicionar "./*" aos exports, este teste reprova
  assert.ok(!Object.keys(pkg.exports).some((k) => k.includes('*')),
            'exports com curinga expoe interno/ e adaptadores/')
})

test('a raiz exporta as fabricas e os adaptadores nomeados', async () => {
  const m = await import('../dist/index.js')
  for (const nome of ['criarNucleo', 'criarProxy', 'dadosHttp',
                      'sessaoArquivo', 'identidadeDev', 'ErroDeAplicacao']) {
    assert.equal(typeof m[nome], 'function', `${nome} ausente na raiz`)
  }
})

test('a raiz NAO exporta upstream nem resolverDestino', async () => {
  const m = await import('../dist/index.js')
  assert.equal(m.upstream, undefined, 'upstream vazou para a superficie publica')
  assert.equal(m.resolverDestino, undefined, 'resolverDestino vazou')
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd repos/erp-nucleo && pnpm test`
Expected: FAIL — `pkg.exports` é `undefined`.

- [ ] **Step 3: Escrever a superfície pública**

`repos/erp-nucleo/src/index.ts`:

```ts
// Superfície pública do núcleo. O que não está aqui não existe para os consumidores.
export { criarNucleo, type ConfigDoNucleo, type Nucleo } from './fabricas/criarNucleo.js'
export { criarProxy, type ConfigDoProxy } from './fabricas/criarProxy.js'

export { dadosHttp } from './adaptadores/dados-http.js'
export { sessaoArquivo } from './adaptadores/sessao-arquivo.js'
export { identidadeDev } from './adaptadores/identidade-dev.js'

export type { PortaDeDados, FabricaDeDados, ObterToken } from './portas/dados.js'
export type { StoreDeSessao, SessaoArmazenada, Sessao } from './portas/sessao.js'
export type { ProvedorDeIdentidade } from './portas/identidade.js'

export {
  ErroDeAplicacao, SessaoInvalida, Desatualizado, DestinoInvalido, NaoEncontrado,
} from './interno/erros.js'

// `upstream` e `resolverDestino` NÃO são exportados: uma zona que os alcançasse
// contornaria a allowlist do elemento 7.
```

- [ ] **Step 4: Declarar os exports no `package.json`**

Substitua o bloco de `package.json` de `erp-nucleo` acrescentando, logo após `"type": "module"`:

```json
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
    "./permissoes": { "types": "./dist/permissoes/index.d.ts", "default": "./dist/permissoes/index.js" },
    "./testing": { "types": "./dist/testing/index.d.ts", "default": "./dist/testing/index.js" }
  },
```

- [ ] **Step 4b: Ligar o lint de fronteira ao `test`**

O script `fronteira` não existia até agora — a Task 3 deixou o `test` sem ele de propósito,
porque um `test` que chama um script inexistente não chega nem a RED. Agora que
`scripts/fronteira.mjs` passa a existir (Step 5), acrescente em `scripts`:

```json
    "fronteira": "node scripts/fronteira.mjs",
```

e troque o `test` para rodá-lo antes dos testes:

```json
    "test": "pnpm build && pnpm fronteira && node --conditions react-server --test test/*.test.mjs",
```

A ordem importa: a fronteira é mais barata que a suíte e falha mais cedo.

- [ ] **Step 5: Escrever o lint de fronteira**

`repos/erp-nucleo/scripts/fronteira.mjs`:

```js
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const SRC = new URL('../src/', import.meta.url).pathname

/** camada de origem -> camadas que ela PODE importar */
const PERMITIDO = {
  interno:     ['interno'],
  portas:      ['portas'],
  adaptadores: ['adaptadores', 'portas', 'interno'],
  fabricas:    ['fabricas', 'adaptadores', 'portas', 'interno'],
  permissoes:  ['permissoes'],
  testing:     ['testing', 'portas', 'interno'],
}

function arquivos(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? arquivos(p) : p.endsWith('.ts') ? [p] : []
  })
}

const camadaDe = (caminho) => relative(SRC, caminho).split('/')[0]
const erros = []

for (const arquivo of arquivos(SRC)) {
  const origem = camadaDe(arquivo)
  if (!(origem in PERMITIDO)) continue
  const texto = readFileSync(arquivo, 'utf8')

  for (const m of texto.matchAll(/from\s+'(\.[^']+)'/g)) {
    const alvo = camadaDe(join(arquivo, '..', m[1]))
    if (!(alvo in PERMITIDO)) continue
    if (!PERMITIDO[origem].includes(alvo)) {
      erros.push(`${relative(SRC, arquivo)}: ${origem}/ nao pode importar ${alvo}/`)
    }
  }

  const precisaServerOnly = origem === 'interno' || origem === 'adaptadores' || origem === 'fabricas'
  const ehTipoPuro = origem === 'portas'
  if (precisaServerOnly && !ehTipoPuro && !texto.includes("import 'server-only'")) {
    // criarProxy roda no runtime de proxy do Next, que nao aceita server-only
    if (!arquivo.endsWith('criarProxy.ts')) {
      erros.push(`${relative(SRC, arquivo)}: falta import 'server-only'`)
    }
  }
  if (origem === 'permissoes' && texto.includes("import 'server-only'")) {
    erros.push(`${relative(SRC, arquivo)}: permissoes/ NAO pode ter server-only — as ilhas precisam dele`)
  }
}

if (erros.length) {
  console.error('fronteira entre camadas violada:\n' + erros.map((e) => '  ' + e).join('\n'))
  process.exit(1)
}
console.log('fronteira entre camadas: ok')
```

- [ ] **Step 6: Verificar que o lint pega uma violação real**

Um teste que nunca falhou não prova nada. Quebre de propósito e confirme que reprova:

Run:
```bash
cd repos/erp-nucleo
echo "import { dadosHttp } from '../adaptadores/dados-http.js'" >> src/interno/erros.ts
pnpm fronteira; echo "codigo de saida: $?"
git checkout src/interno/erros.ts
```
Expected: imprime `interno/erros.ts: interno/ nao pode importar adaptadores/` e `codigo de saida: 1`.

- [ ] **Step 7: Rodar tudo e confirmar que passa**

Run: `cd repos/erp-nucleo && pnpm test`
Expected: `fronteira entre camadas: ok` seguido de PASS, 27 testes.

- [ ] **Step 8: Publicar e commitar**

```bash
cd repos/erp-nucleo
pnpm publicar
curl -sf http://localhost:4873/@erp/nucleo > /dev/null && echo PUBLICADO_OK
git add -A && git commit -m "feat: restrict package exports and add layer boundary lint"
```

---

### Task 7: `erp-dominio-stub` — o caso, com projeção por ator

**Files:**
- Create: `repos/erp-dominio-stub/package.json`
- Create: `repos/erp-dominio-stub/pnpm-workspace.yaml`
- Create: `repos/erp-dominio-stub/src/atores.mjs`
- Create: `repos/erp-dominio-stub/src/pedido-8821.mjs`
- Create: `repos/erp-dominio-stub/src/projetar.mjs`
- Create: `repos/erp-dominio-stub/src/servidor.mjs`
- Test: `repos/erp-dominio-stub/test/projecao.test.mjs`

**Interfaces:**
- Consumes: nada — o stub é deliberadamente independente do núcleo
- Produces: servidor em `http://127.0.0.1:4000` com `GET /pedidos/:id`; função `projetar(pedido, ator)` exportada para teste; `revogar(usuario, grupo)` via `POST /_dev/revogar` para o cenário C7

- [ ] **Step 1: Escrever o teste de projeção que falha**

`repos/erp-dominio-stub/test/projecao.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { projetar } from '../src/projetar.mjs'
import { PEDIDO_8821 } from '../src/pedido-8821.mjs'
import { ATORES } from '../src/atores.mjs'

const proj = (u) => projetar(PEDIDO_8821, ATORES[u])

test('C1: gabrigas ve o operacional e NAO ve a condicao comercial', () => {
  const p = proj('gabrigas')
  assert.equal(p.id, '8821')
  assert.ok(p.itens.length > 0)
  // ausencia TOTAL: a chave nao existe. `null` ja informaria que o bloco existe.
  assert.ok(!('condicaoComercial' in p), 'a chave condicaoComercial nao pode existir')
  assert.ok(!JSON.stringify(p).includes('margem'))
  assert.ok(!JSON.stringify(p).includes('precoNegociado'))
})

test('C1: marina ve a condicao comercial', () => {
  const p = proj('marina')
  assert.ok('condicaoComercial' in p)
  assert.equal(typeof p.condicaoComercial.margem, 'number')
})

test('C1: rafael e ADMIN mas NAO ve a condicao comercial — role nao e grupo', () => {
  const p = proj('rafael')
  assert.ok(!('condicaoComercial' in p),
            'ADMIN nao concede o grupo COMERCIAL-NORDESTE')
})

test('C1: carla nao conhece o pedido', () => {
  assert.equal(proj('carla'), null)
})

test('_permissoes e Record completo para todos os atores autorizados', () => {
  const acoes = ['editar', 'remover_remessa', 'excluir', 'aprovar']
  for (const u of ['gabrigas', 'marina', 'rafael']) {
    assert.deepEqual(Object.keys(proj(u)._permissoes).sort(), [...acoes].sort(), u)
    for (const a of acoes) assert.equal(typeof proj(u)._permissoes[a], 'boolean')
  }
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run:
```bash
mkdir -p repos/erp-dominio-stub/src repos/erp-dominio-stub/test
cd repos/erp-dominio-stub && git init -q
node --test test/*.test.mjs
```
Expected: FAIL — `Cannot find module '../src/projetar.mjs'`.

- [ ] **Step 3: Escrever os atores e o fixture**

`repos/erp-dominio-stub/package.json`:

`repos/erp-dominio-stub/pnpm-workspace.yaml`:

```yaml
packages: []
```

```json
{
  "name": "erp-dominio-stub",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": { "dev": "node src/servidor.mjs", "test": "node --test test/*.test.mjs" }
}
```

`repos/erp-dominio-stub/src/atores.mjs`:

```js
/** Tabela de 00-caso.md §2. Grupos vivem no domínio, nunca na sessão do BFF. */
export const ATORES = {
  gabrigas: { sub: 'gabrigas', roles: ['OPERADOR'], grupos: ['OPS-NORDESTE'] },
  marina:   { sub: 'marina',   roles: ['OPERADOR'], grupos: ['OPS-NORDESTE', 'COMERCIAL-NORDESTE'] },
  rafael:   { sub: 'rafael',   roles: ['ADMIN'],    grupos: ['OPS-NORDESTE'] },
  carla:    { sub: 'carla',    roles: ['OPERADOR'], grupos: ['OPS-SUL'] },
}

/** C7 — acesso revogado durante a sessão. Muta a tabela em memória. */
export function revogar(usuario, grupo) {
  const a = ATORES[usuario]
  if (!a) return false
  a.grupos = a.grupos.filter((g) => g !== grupo)
  return true
}
```

`repos/erp-dominio-stub/src/pedido-8821.mjs`:

```js
/** Fixture completo, ANTES da projeção. Nenhum consumidor recebe isto inteiro. */
export const PEDIDO_8821 = {
  id: '8821',
  status: 'ABERTO',
  versao: 42,
  grupoDono: 'OPS-NORDESTE',
  fornecedor: { id: 'f-100', nome: 'Metalúrgica Aurora' },
  itens: [
    { id: 'i-1', descricao: 'Chapa de aço 2mm', quantidade: 120 },
    { id: 'i-2', descricao: 'Parafuso sextavado M8', quantidade: 4000 },
  ],
  remessas: [{ id: '4410', status: 'EM_TRANSITO' }],
  condicaoComercial: { precoNegociado: 184_500.0, margem: 0.17, contrato: 'CT-2026-0091' },
}
```

- [ ] **Step 4: Escrever a projeção**

`repos/erp-dominio-stub/src/projetar.mjs`:

```js
const GRUPO_COMERCIAL = 'COMERCIAL-NORDESTE'

/**
 * A projeção acontece AQUI, no domínio. O BFF não filtra e não mascara: se ele
 * precisasse filtrar, o campo teria existido em memória no processo errado.
 *
 * Devolve `null` quando o ator não conhece o pedido — o servidor traduz para 404.
 */
export function projetar(pedido, ator) {
  if (!ator) return null
  if (!ator.grupos.includes(pedido.grupoDono)) return null

  const podeComercial = ator.grupos.includes(GRUPO_COMERCIAL)

  const projetado = {
    id: pedido.id,
    status: pedido.status,
    versao: pedido.versao,
    fornecedor: pedido.fornecedor,
    itens: pedido.itens,
    remessas: pedido.remessas,
    _permissoes: {
      // Record COMPLETO. Fatia 1 é somente leitura, então tudo nega — mas as
      // quatro chaves existem, e é isso que o contrato exige.
      editar: false,
      remover_remessa: false,
      excluir: false,
      aprovar: false,
    },
  }

  // ausência total, sem placeholder: a chave só é criada quando autorizada
  if (podeComercial) projetado.condicaoComercial = pedido.condicaoComercial

  return projetado
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `cd repos/erp-dominio-stub && node --test test/*.test.mjs`
Expected: PASS, 5 testes.

- [ ] **Step 6: Escrever o servidor**

`repos/erp-dominio-stub/src/servidor.mjs`:

```js
import { createServer } from 'node:http'
import { ATORES, revogar } from './atores.mjs'
import { PEDIDO_8821 } from './pedido-8821.mjs'
import { projetar } from './projetar.mjs'

const PORTA = Number(process.env.PORTA ?? 4000)

/** O token de dev tem a forma `dev.<usuario>.<uuid>`. Um IdP real traria claims. */
function atorDoToken(auth) {
  if (!auth?.startsWith('Bearer ')) return null
  const partes = auth.slice(7).split('.')
  if (partes[0] !== 'dev') return null
  return ATORES[partes[1]] ?? null
}

const json = (res, status, corpo, headers = {}) => {
  res.writeHead(status, { 'content-type': 'application/json', ...headers })
  res.end(corpo === undefined ? '' : JSON.stringify(corpo))
}

createServer((req, res) => {
  // Elemento 3 do núcleo: o domínio não é alcançável a partir do navegador.
  // Um pedido vindo de um documento carrega Origin ou Sec-Fetch-Mode; o adaptador
  // do BFF, que é fetch de servidor, não carrega nenhum dos dois.
  if (req.headers.origin || req.headers['sec-fetch-mode']) {
    return json(res, 403, { codigo: 'OPERACAO_NAO_PERMITIDA' })
  }

  if (req.method === 'POST' && req.url === '/_dev/revogar') {
    let corpo = ''
    req.on('data', (c) => { corpo += c })
    req.on('end', () => {
      const { usuario, grupo } = JSON.parse(corpo || '{}')
      json(res, revogar(usuario, grupo) ? 204 : 404, undefined)
    })
    return
  }

  const ator = atorDoToken(req.headers.authorization)
  // sem credencial: recusa sem descrever o motivo
  if (!ator) return json(res, 401, { codigo: 'SESSAO_EXPIRADA' })

  const m = /^\/pedidos\/([^/?]+)$/.exec(req.url ?? '')
  if (!m) return json(res, 404, { codigo: 'ERRO_INTERNO' })

  const id = decodeURIComponent(m[1])
  const pedido = id === PEDIDO_8821.id ? PEDIDO_8821 : null
  const projetado = pedido ? projetar(pedido, ator) : null

  // 404 idêntico para "não existe" e "você não pode ver" — mesmo corpo, mesmos headers
  if (!projetado) return json(res, 404, { codigo: 'ERRO_INTERNO' })

  json(res, 200, projetado, { etag: `"${projetado.versao}"` })
}).listen(PORTA, '127.0.0.1', () => {
  console.log(`stub do domínio em http://127.0.0.1:${PORTA} (somente loopback)`)
})
```

- [ ] **Step 7: Verificar o servidor manualmente**

Run:
```bash
cd repos/erp-dominio-stub && node src/servidor.mjs &
sleep 1
echo "--- gabrigas (nao deve ter condicaoComercial) ---"
curl -s -H "Authorization: Bearer dev.gabrigas.x" http://127.0.0.1:4000/pedidos/8821 | grep -c margem
echo "--- marina (deve ter) ---"
curl -s -H "Authorization: Bearer dev.marina.x" http://127.0.0.1:4000/pedidos/8821 | grep -c margem
echo "--- carla (404) ---"
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer dev.carla.x" http://127.0.0.1:4000/pedidos/8821
echo "--- sem credencial (401) ---"
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4000/pedidos/8821
echo "--- com Origin, simulando o navegador (403) ---"
curl -s -o /dev/null -w "%{http_code}\n" -H "Origin: http://localhost:3000" \
     -H "Authorization: Bearer dev.marina.x" http://127.0.0.1:4000/pedidos/8821
```
Expected, em ordem: `0`, `1`, `404`, `401`, `403`.

- [ ] **Step 8: Commit**

```bash
cd repos/erp-dominio-stub
git add -A && git commit -m "feat: add domain stub serving the purchase order case with per-actor projection"
```

---

### Task 8: `erp-shell` — login, sessão e gateway

**Files:**
- Create: `repos/erp-shell/package.json`, `tsconfig.json`, `.npmrc`, `next.config.ts`
- Create: `repos/erp-shell/pnpm-workspace.yaml`
- Create: `repos/erp-shell/lib/nucleo.ts`
- Create: `repos/erp-shell/app/layout.tsx`
- Create: `repos/erp-shell/app/page.tsx`
- Create: `repos/erp-shell/app/login/page.tsx`
- Create: `repos/erp-shell/app/api/auth/entrar/route.ts`
- Create: `repos/erp-shell/app/erro-de-zona/page.tsx`

**Interfaces:**
- Consumes: `@erp/nucleo` — `criarNucleo`, `sessaoArquivo`, `identidadeDev`, `dadosHttp`
- Produces: shell em `:3000`; `POST /api/auth/entrar` com `{ usuario }` grava `__Host-session` e redireciona; rewrites de `/pedidos/*` para `:3001`

- [ ] **Step 1: Criar o app**

```bash
mkdir -p repos/erp-shell/app/login repos/erp-shell/app/api/auth/entrar repos/erp-shell/app/erro-de-zona repos/erp-shell/lib
cd repos/erp-shell && git init -q
```

`repos/erp-shell/package.json`:

```json
{
  "name": "erp-shell",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start -p 3000",
    "lockstep": "node scripts/verificar-lockstep.mjs"
  },
  "dependencies": {
    "@erp/nucleo": "0.1.0",
    "@erp/contratos": "0.1.0",
    "next": "^16.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "server-only": "^0.0.1"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "@types/node": "^24.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0"
  }
}
```

`repos/erp-shell/.npmrc`:

```
@erp:registry=http://localhost:4873
```

`repos/erp-shell/pnpm-workspace.yaml`:

```yaml
packages: []
```

`repos/erp-shell/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023", "lib": ["ES2023", "DOM"], "jsx": "preserve",
    "module": "ESNext", "moduleResolution": "bundler",
    "strict": true, "exactOptionalPropertyTypes": true,
    "noEmit": true, "skipLibCheck": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 2: Configurar os rewrites**

`repos/erp-shell/next.config.ts`:

```ts
import type { NextConfig } from 'next'

const ZONA_PEDIDOS = process.env.ZONA_PEDIDOS ?? 'http://localhost:3001'

const config: NextConfig = {
  poweredByHeader: false,   // 06-seguranca.md: fingerprinting de framework
  async rewrites() {
    return [
      // A zona serve suas próprias páginas sob /pedidos/*.
      { source: '/pedidos', destination: `${ZONA_PEDIDOS}/pedidos` },
      { source: '/pedidos/:path*', destination: `${ZONA_PEDIDOS}/pedidos/:path*` },
      // Assets da zona sob prefixo exclusivo — limitação 5: duas zonas
      // servindo /_next colidiriam.
      { source: '/pedidos-static/:path*', destination: `${ZONA_PEDIDOS}/pedidos-static/:path*` },
    ]
    // NÃO delegue /api/auth/*, /api/stream ou /api/otel/* — limitação 6.
    // Eles são sempre do shell, e por isso não aparecem nesta lista.
  },
}

export default config
```

- [ ] **Step 3: Montar o núcleo do shell**

`repos/erp-shell/lib/nucleo.ts`:

```ts
import 'server-only'
import { cookies } from 'next/headers'
import { criarNucleo, dadosHttp, sessaoArquivo, identidadeDev } from '@erp/nucleo'

export const nucleo = criarNucleo({
  dados: dadosHttp({ baseUrl: process.env.API_BASE_URL ?? 'http://127.0.0.1:4000' }),
  sessao: sessaoArquivo({ dir: process.env.SESSAO_DIR ?? '/tmp/erp-sessoes' }),
  identidade: identidadeDev(),
  lerCookieDeSessao: async () => (await cookies()).get('__Host-session')?.value,
})
```

- [ ] **Step 4: Escrever o login e a rota de entrada**

`repos/erp-shell/app/login/page.tsx`:

```tsx
export default async function Login({
  searchParams,
}: { searchParams: Promise<{ de?: string }> }) {
  const { de } = await searchParams
  const atores = ['gabrigas', 'marina', 'rafael', 'carla']
  return (
    <main>
      <h1>Entrar</h1>
      <p>Ambiente de desenvolvimento. Escolha um dos atores do caso.</p>
      {atores.map((u) => (
        <form key={u} method="post" action="/api/auth/entrar">
          <input type="hidden" name="usuario" value={u} />
          <input type="hidden" name="de" value={de ?? '/pedidos/8821'} />
          <button type="submit">{u}</button>
        </form>
      ))}
    </main>
  )
}
```

`repos/erp-shell/app/api/auth/entrar/route.ts`:

```ts
import 'server-only'
import { randomUUID } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { nucleo } from '@/lib/nucleo'

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const usuario = form.get('usuario')
  const de = String(form.get('de') ?? '/pedidos/8821')

  const sessao = await nucleo.identidade.autenticar({ usuario })
  if (!sessao) return NextResponse.redirect(new URL('/login', req.url), 303)

  const id = randomUUID()
  await nucleo.store.gravar(id, sessao)

  // destino interno apenas: nunca redirecione para valor arbitrário do cliente
  const destino = de.startsWith('/') && !de.startsWith('//') ? de : '/pedidos/8821'
  const res = NextResponse.redirect(new URL(destino, req.url), 303)
  res.cookies.set('__Host-session', id, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/',
  })
  return res
}
```

- [ ] **Step 5: Escrever layout, home e página de erro de zona**

`repos/erp-shell/app/layout.tsx`:

```tsx
export const metadata = { title: 'demo-erp' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="pt-BR"><body>{children}</body></html>
}
```

`repos/erp-shell/app/page.tsx`:

```tsx
export default function Home() {
  return (
    <main>
      <h1>demo-erp</h1>
      <p><a href="/pedidos/8821">Pedido 8821</a></p>
    </main>
  )
}
```

`repos/erp-shell/app/erro-de-zona/page.tsx`:

```tsx
export default function ErroDeZona() {
  return (
    <main>
      <h1>Esta área está indisponível</h1>
      <p>Tente novamente em instantes.</p>
      <p><a href="/">Voltar ao início</a></p>
    </main>
  )
}
```

**Caveat do `__Host-session` em desenvolvimento.** O prefixo `__Host-` exige `Secure`, que
exige origem confiável. Chrome e Firefox tratam `http://localhost` como confiável, então o
cookie funciona. Se você servir por `127.0.0.1` em vez de `localhost`, ou por um IP de rede,
o navegador **descarta o cookie em silêncio** e o login parece não fazer nada. Use
`localhost`.

- [ ] **Step 6: Instalar e subir**

Run:
```bash
cd repos/erp-shell && pnpm install
pnpm dev &
sleep 8
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/login
```
Expected: `200`.

Se `pnpm install` não encontrar `@erp/nucleo`, confirme que o Verdaccio está no ar e que as Tasks 2 e 6 publicaram.

- [ ] **Step 7: Commit**

```bash
cd repos/erp-shell
git add -A && git commit -m "feat: add shell with dev login, session cookie and zone rewrites"
```

---

### Task 9: `erp-mfe-pedidos` — a zona e a tela do caso

**Files:**
- Create: `repos/erp-mfe-pedidos/package.json`, `tsconfig.json`, `.npmrc`, `next.config.ts`
- Create: `repos/erp-mfe-pedidos/pnpm-workspace.yaml`
- Create: `repos/erp-mfe-pedidos/proxy.ts`
- Create: `repos/erp-mfe-pedidos/lib/nucleo.ts`
- Create: `repos/erp-mfe-pedidos/app/layout.tsx`
- Create: `repos/erp-mfe-pedidos/app/pedidos/[id]/page.tsx`
- Create: `repos/erp-mfe-pedidos/app/pedidos/[id]/AcoesDoPedido.tsx`

**Interfaces:**
- Consumes: `@erp/nucleo` — `criarNucleo`, `criarProxy`, `dadosHttp`, `sessaoArquivo`, `identidadeDev`, `NaoEncontrado`; `@erp/nucleo/permissoes` — `pode`
- Produces: zona em `:3001` servindo `/pedidos/[id]`

- [ ] **Step 1: Criar o app**

```bash
mkdir -p "repos/erp-mfe-pedidos/app/pedidos/[id]" repos/erp-mfe-pedidos/lib
cd repos/erp-mfe-pedidos && git init -q
```

`repos/erp-mfe-pedidos/package.json`:

```json
{
  "name": "erp-mfe-pedidos",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3001",
    "build": "next build",
    "start": "next start -p 3001",
    "test": "node --test test/*.test.mjs",
    "lockstep": "node scripts/verificar-lockstep.mjs"
  },
  "dependencies": {
    "@erp/nucleo": "0.1.0",
    "@erp/contratos": "0.1.0",
    "next": "^16.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "server-only": "^0.0.1"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "@types/node": "^24.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0"
  }
}
```

`repos/erp-mfe-pedidos/.npmrc`:

```
@erp:registry=http://localhost:4873
```

`repos/erp-mfe-pedidos/pnpm-workspace.yaml`:

```yaml
packages: []
```

`repos/erp-mfe-pedidos/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023", "lib": ["ES2023", "DOM"], "jsx": "preserve",
    "module": "ESNext", "moduleResolution": "bundler",
    "strict": true, "exactOptionalPropertyTypes": true,
    "noEmit": true, "skipLibCheck": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`repos/erp-mfe-pedidos/next.config.ts`:

```ts
import type { NextConfig } from 'next'

const config: NextConfig = {
  poweredByHeader: false,
  // Prefixo exclusivo de assets — limitação 5. O shell reencaminha
  // /pedidos-static/* para cá; sem isto, duas zonas colidiriam em /_next.
  assetPrefix: '/pedidos-static',
}

export default config
```

- [ ] **Step 2: Escrever o proxy da zona**

`repos/erp-mfe-pedidos/proxy.ts`:

```ts
import { criarProxy } from '@erp/nucleo'

// Uma linha. Sem esta fábrica, cada zona reimplementaria sessão e CSP e
// divergiria com o tempo — limitação 4.
export default criarProxy({ prefixo: '/pedidos', rotaLogin: '/login' })

export const config = {
  matcher: ['/pedidos/:path*'],
}
```

- [ ] **Step 3: Montar o núcleo da zona**

`repos/erp-mfe-pedidos/lib/nucleo.ts`:

```ts
import 'server-only'
import { cookies } from 'next/headers'
import { criarNucleo, dadosHttp, sessaoArquivo, identidadeDev } from '@erp/nucleo'

// Idêntico ao do shell exceto pela configuração. Trocar o stub pelo domínio
// Spring Boot real é trocar API_BASE_URL — nenhum arquivo desta zona muda.
export const nucleo = criarNucleo({
  dados: dadosHttp({ baseUrl: process.env.API_BASE_URL ?? 'http://127.0.0.1:4000' }),
  sessao: sessaoArquivo({ dir: process.env.SESSAO_DIR ?? '/tmp/erp-sessoes' }),
  identidade: identidadeDev(),
  lerCookieDeSessao: async () => (await cookies()).get('__Host-session')?.value,
})
```

- [ ] **Step 4: Escrever a ilha de ações**

`repos/erp-mfe-pedidos/app/pedidos/[id]/AcoesDoPedido.tsx`:

```tsx
'use client'

import { pode } from '@erp/nucleo/permissoes'
import { ACOES_PEDIDO, type PermissoesPedido } from '@erp/contratos'

/**
 * Recebe SÓ `_permissoes`, nunca o PedidoDTO inteiro. Invariante 2: o objeto
 * passado a uma ilha é serializado por completo, inclusive campos não
 * renderizados — passar o pedido aqui vazaria a condição comercial.
 */
export function AcoesDoPedido({ permissoes }: { permissoes: PermissoesPedido }) {
  const rotulos: Record<string, string> = {
    editar: 'Editar', remover_remessa: 'Remover remessa',
    excluir: 'Excluir', aprovar: 'Aprovar',
  }
  return (
    <div>
      {ACOES_PEDIDO.filter((a) => pode(permissoes, a)).map((a) => (
        <button key={a} type="button" disabled>{rotulos[a]}</button>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Escrever a página**

`repos/erp-mfe-pedidos/app/layout.tsx`:

```tsx
export const metadata = { title: 'Pedidos' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="pt-BR"><body>{children}</body></html>
}
```

`repos/erp-mfe-pedidos/app/pedidos/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { NaoEncontrado } from '@erp/nucleo'
import { nucleo } from '@/lib/nucleo'
import { AcoesDoPedido } from './AcoesDoPedido'

export default async function PaginaDoPedido({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await nucleo.sessao.exigir()   // camada 2 — a primeira que é segurança de verdade

  let pedido
  try {
    ({ pedido } = await nucleo.dados.lerPedido(id))
  } catch (e) {
    // "não existe" e "você não pode ver" são indistinguíveis, de propósito
    if (e instanceof NaoEncontrado) notFound()
    throw e
  }

  return (
    <main>
      <h1>Pedido {pedido.id}</h1>
      <p>Status: {pedido.status} · Fornecedor: {pedido.fornecedor.nome}</p>

      <h2>Itens</h2>
      <ul>
        {pedido.itens.map((i) => (
          <li key={i.id}>{i.descricao} — {i.quantidade}</li>
        ))}
      </ul>

      <h2>Remessas</h2>
      <ul>
        {pedido.remessas.map((r) => <li key={r.id}>{r.id} — {r.status}</li>)}
      </ul>

      {/* O bloco some no SERVIDOR. Não vem no payload e é renderizado como nada. */}
      {pedido.condicaoComercial && (
        <section>
          <h2>Condição comercial</h2>
          <p>Contrato: {pedido.condicaoComercial.contrato}</p>
          <p>Preço negociado: {pedido.condicaoComercial.precoNegociado}</p>
          <p>Margem: {pedido.condicaoComercial.margem}</p>
        </section>
      )}

      <AcoesDoPedido permissoes={pedido._permissoes} />
    </main>
  )
}
```

- [ ] **Step 6: Subir tudo e ver a tela**

Run:
```bash
cd repos/erp-mfe-pedidos && pnpm install && pnpm dev &
sleep 8
curl -s -o /dev/null -w "zona direta: %{http_code}\n" http://localhost:3001/pedidos/8821
curl -s -o /dev/null -w "via shell, sem cookie: %{http_code}\n" -L http://localhost:3000/pedidos/8821
```
Expected: a zona direta responde `307` (redirect para login, porque não há cookie); via shell com `-L` termina em `200` na página de login.

- [ ] **Step 7: Commit**

```bash
cd repos/erp-mfe-pedidos
git add -A && git commit -m "feat: add pedidos zone rendering the case screen"
```

---

### Task 10: Os testes de invariante ponta a ponta

Esta é a task que decide se a fatia 1 vale. Todas as anteriores podem estar verdes e um invariante ainda estar quebrado.

**Files:**
- Create: `repos/erp-mfe-pedidos/test/ambiente.mjs`
- Create: `repos/erp-mfe-pedidos/test/invariantes.test.mjs`
- Create: `repos/erp-mfe-pedidos/test/caso.test.mjs`
- Nota: `"test": "node --test test/*.test.mjs"` já está no `package.json` criado na Task 9

**Interfaces:**
- Consumes: shell em `:3000`, zona em `:3001`, stub em `:4000`, todos no ar
- Produces: prova executável dos invariantes 1, 2, 3, 6, 7 e dos cenários C1 e C7

- [ ] **Step 1: Escrever o utilitário de sessão**

`repos/erp-mfe-pedidos/test/ambiente.mjs`:

```js
export const SHELL = 'http://localhost:3000'

/** Faz login como um ator e devolve o valor do cookie de sessão. */
export async function entrarComo(usuario) {
  const corpo = new URLSearchParams({ usuario, de: '/pedidos/8821' })
  const res = await fetch(`${SHELL}/api/auth/entrar`, {
    method: 'POST', body: corpo, redirect: 'manual',
  })
  const set = res.headers.get('set-cookie')
  if (!set) throw new Error(`login falhou para ${usuario}: ${res.status}`)
  return set.split(';')[0]
}

/** Busca uma página do shell autenticado como `usuario`. */
export async function buscarPagina(usuario, caminho) {
  const cookie = await entrarComo(usuario)
  const res = await fetch(`${SHELL}${caminho}`, { headers: { cookie }, redirect: 'manual' })
  return { status: res.status, html: await res.text(), cookie }
}

/** Baixa todo JS que a página referencia, para varrer o bundle junto do HTML. */
export async function buscarPaginaEScripts(usuario, caminho) {
  const { status, html, cookie } = await buscarPagina(usuario, caminho)
  const srcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1])
  const scripts = await Promise.all(srcs.map(async (s) => {
    const url = s.startsWith('http') ? s : `${SHELL}${s}`
    const r = await fetch(url, { headers: { cookie } })
    return r.ok ? r.text() : ''
  }))
  return { status, texto: html + scripts.join('\n') }
}
```

- [ ] **Step 2: Escrever os testes de invariante**

`repos/erp-mfe-pedidos/test/invariantes.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buscarPaginaEScripts, entrarComo, SHELL } from './ambiente.mjs'

const ATORES = ['gabrigas', 'marina', 'rafael']

test('invariante 1: nenhuma credencial no navegador, para nenhum ator', async () => {
  for (const u of ATORES) {
    const { texto } = await buscarPaginaEScripts(u, '/pedidos/8821')
    for (const proibido of ['access_token', 'refresh_token', 'accessToken', 'Bearer ', 'dev.']) {
      assert.ok(!texto.includes(proibido), `${u}: "${proibido}" chegou ao navegador`)
    }
    assert.ok(!texto.includes('OPS-NORDESTE'), `${u}: grupo vazou`)
    assert.ok(!texto.includes('COMERCIAL-NORDESTE'), `${u}: grupo vazou`)
  }
})

test('invariante 2: gabrigas nao recebe a condicao comercial em nenhuma serializacao', async () => {
  const { texto } = await buscarPaginaEScripts('gabrigas', '/pedidos/8821')
  for (const campo of ['condicaoComercial', 'precoNegociado', 'margem', 'CT-2026-0091', '184500']) {
    assert.ok(!texto.includes(campo), `campo sensivel "${campo}" no payload de gabrigas`)
  }
})

test('invariante 2: rafael e ADMIN e tambem nao recebe — role nao e grupo', async () => {
  const { texto } = await buscarPaginaEScripts('rafael', '/pedidos/8821')
  for (const campo of ['condicaoComercial', 'precoNegociado', 'margem', 'CT-2026-0091']) {
    assert.ok(!texto.includes(campo), `ADMIN recebeu "${campo}"`)
  }
})

test('invariante 3: o dominio nao e alcancavel a partir do navegador', async () => {
  const res = await fetch('http://127.0.0.1:4000/pedidos/8821', {
    headers: { origin: SHELL, authorization: 'Bearer dev.marina.x' },
  })
  assert.equal(res.status, 403)
})

test('sem cookie, a zona redireciona para o login e nao entrega conteudo', async () => {
  const res = await fetch(`${SHELL}/pedidos/8821`, { redirect: 'manual' })
  assert.ok([302, 307, 308].includes(res.status), `esperava redirect, veio ${res.status}`)
  assert.ok((res.headers.get('location') ?? '').includes('/login'))
})

test('cookie forjado passa da camada 1 e e barrado pela camada 2', async () => {
  // 06-seguranca.md §2: a camada 1 so olha presenca. Isto e esperado, nao defeito.
  const res = await fetch(`${SHELL}/pedidos/8821`, {
    headers: { cookie: '__Host-session=forjado-nao-existe' }, redirect: 'manual',
  })
  assert.notEqual(res.status, 200, 'cookie forjado nao pode render conteudo')
})

test('o redirect nao vaza a origem da zona', async () => {
  // O navegador fala so com o shell. Um Location apontando para :3001 entregaria
  // a topologia interna e quebraria a sessao, porque o usuario sairia do gateway.
  const res = await fetch(`${SHELL}/pedidos/8821`, { redirect: 'manual' })
  const location = res.headers.get('location') ?? ''
  assert.ok(!location.includes('3001'), `Location vazou a zona: ${location}`)
})

test('a resposta nao anuncia o framework', async () => {
  const res = await fetch(`${SHELL}/login`)
  assert.equal(res.headers.get('x-powered-by'), null)
})
```

- [ ] **Step 3: Escrever os testes do caso**

`repos/erp-mfe-pedidos/test/caso.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buscarPagina, entrarComo, SHELL } from './ambiente.mjs'

test('C1: gabrigas e marina, mesma rota, paginas diferentes', async () => {
  const g = await buscarPagina('gabrigas', '/pedidos/8821')
  const m = await buscarPagina('marina', '/pedidos/8821')

  assert.equal(g.status, 200)
  assert.equal(m.status, 200)
  assert.ok(g.html.includes('Metalúrgica Aurora'), 'gabrigas deve ver o operacional')
  assert.ok(m.html.includes('Metalúrgica Aurora'), 'marina deve ver o operacional')

  assert.ok(!g.html.includes('Condição comercial'), 'gabrigas nao pode ver o bloco')
  assert.ok(m.html.includes('Condição comercial'), 'marina deve ver o bloco')
})

test('C1: rafael, ADMIN, ve o operacional e nao ve o bloco comercial', async () => {
  const r = await buscarPagina('rafael', '/pedidos/8821')
  assert.equal(r.status, 200)
  assert.ok(r.html.includes('Metalúrgica Aurora'))
  assert.ok(!r.html.includes('Condição comercial'))
})

test('C1: carla recebe 404, indistinguivel de um id que nunca existiu', async () => {
  const daCarla = await buscarPagina('carla', '/pedidos/8821')
  const inexistente = await buscarPagina('gabrigas', '/pedidos/9999')
  assert.equal(daCarla.status, 404)
  assert.equal(inexistente.status, 404)
  // nenhuma pista de que 8821 existe
  assert.ok(!daCarla.html.includes('8821') || daCarla.html === inexistente.html)
})

test('C7: revogado o grupo, a proxima leitura devolve 404 neutro', async () => {
  const cookie = await entrarComo('gabrigas')

  const antes = await fetch(`${SHELL}/pedidos/8821`, { headers: { cookie } })
  assert.equal(antes.status, 200)

  await fetch('http://127.0.0.1:4000/_dev/revogar', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ usuario: 'gabrigas', grupo: 'OPS-NORDESTE' }),
  })

  const depois = await fetch(`${SHELL}/pedidos/8821`, { headers: { cookie } })
  assert.equal(depois.status, 404, 'a sessao continua valida; o acesso ao dado nao')
})
```

- [ ] **Step 4: Rodar com tudo no ar**

Run:
```bash
# terminal 1
node repos/scripts/registry.mjs up
cd repos/erp-dominio-stub && node src/servidor.mjs &
cd repos/erp-shell && pnpm dev &
cd repos/erp-mfe-pedidos && pnpm dev &
sleep 12
cd repos/erp-mfe-pedidos && node --test test/*.test.mjs
```
Expected: PASS, 11 testes.

**C7 muta o stub em memória.** Rode-o por último ou reinicie o stub antes de repetir a suíte — `gabrigas` fica sem `OPS-NORDESTE` até o processo reiniciar.

- [ ] **Step 5: Confirmar que os testes pegam o defeito que deveriam pegar**

Um teste que nunca falhou não prova nada. Quebre de propósito:

Quebre a **projeção do domínio**, que é onde o invariante realmente mora — se o stub
entregar o bloco a todo mundo, o BFF passa a ter dado sensível em memória para `gabrigas`,
que é exatamente o defeito que o invariante 2 existe para pegar:

```bash
cd repos/erp-dominio-stub
sed -i 's/if (podeComercial) projetado.condicaoComercial/projetado.condicaoComercial/' src/projetar.mjs
# reinicie o stub para carregar a mudanca
kill %1 2>/dev/null; node src/servidor.mjs &
sleep 2
cd ../erp-mfe-pedidos && node --test test/invariantes.test.mjs test/caso.test.mjs
```
Expected: **FALHA** em quatro testes — invariante 2 para `gabrigas`, invariante 2 para
`rafael`, C1 (`gabrigas` não pode ver o bloco) e C1 (`rafael` idem). Se algum deles passar
com o defeito presente, **o teste está errado, não o código.**

Reverta e confirme que voltam ao verde:

```bash
cd repos/erp-dominio-stub && git checkout src/projetar.mjs
kill %1 2>/dev/null; node src/servidor.mjs &
sleep 2
cd ../erp-mfe-pedidos && node --test test/*.test.mjs
```

- [ ] **Step 6: Provar o invariante 6 — `server-only` é fronteira de BUILD**

Este é o único invariante que não se prova em runtime: ele tem que **quebrar a compilação**.
`AcoesDoPedido.tsx` é uma ilha `'use client'`, então serve de prova.

Run:
```bash
cd repos/erp-mfe-pedidos
cp "app/pedidos/[id]/AcoesDoPedido.tsx" /tmp/ilha-original.tsx
sed -i "2i import { dadosHttp } from '@erp/nucleo'" "app/pedidos/[id]/AcoesDoPedido.tsx"
pnpm build; echo "codigo de saida: $?"
```
Expected: **o build FALHA**, com mensagem citando `server-only` e o nome do arquivo da ilha.
`codigo de saida: 1`.

Se o build **passar**, o invariante 6 não existe neste repositório — pare e investigue antes
de seguir. As causas prováveis são `server-only` ausente das dependências do núcleo ou um
adaptador sem a diretiva no topo.

Restaure e confirme que o build volta a passar:

```bash
cp /tmp/ilha-original.tsx "app/pedidos/[id]/AcoesDoPedido.tsx"
pnpm build; echo "codigo de saida: $?"
```
Expected: `codigo de saida: 0`.

- [ ] **Step 7: Commit**

```bash
cd repos/erp-mfe-pedidos
git add -A && git commit -m "test: prove invariants 1, 2, 3, 6 and scenarios C1 and C7 end to end"
```

---

### Task 11: O gate de lockstep

**Files:**
- Create: `repos/erp-shell/scripts/verificar-lockstep.mjs`
- Create: `repos/erp-mfe-pedidos/scripts/verificar-lockstep.mjs` (mesmo conteúdo)
- Modify: `repos/erp-nucleo/package.json` — script `marcar-lockstep`

**Interfaces:**
- Consumes: `@erp/nucleo` publicado no Verdaccio
- Produces: `pnpm lockstep` em cada consumidor, saindo com código 1 quando a versão diverge do dist-tag

- [ ] **Step 1: Escrever o verificador**

`repos/erp-shell/scripts/verificar-lockstep.mjs` (copie idêntico para `erp-mfe-pedidos`):

```js
import { readFileSync } from 'node:fs'

const REGISTRY = process.env.ERP_REGISTRY ?? 'http://localhost:4873'
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const atual = pkg.dependencies?.['@erp/nucleo']

if (!atual) {
  console.error('este repositorio nao depende de @erp/nucleo')
  process.exit(1)
}

const res = await fetch(`${REGISTRY}/-/package/@erp%2fnucleo/dist-tags`)
if (!res.ok) {
  console.error(`nao consegui ler os dist-tags em ${REGISTRY}: ${res.status}`)
  process.exit(1)
}
const tags = await res.json()
const esperado = tags.lockstep

if (!esperado) {
  console.error('o dist-tag "lockstep" nao existe; rode `pnpm marcar-lockstep` em erp-nucleo')
  process.exit(1)
}

if (atual !== esperado) {
  console.error(`nucleo fora de lockstep: ${atual} != ${esperado}`)
  console.error('dois contratos de erro ou duas allowlists no mesmo produto e falha de seguranca')
  process.exit(1)
}
console.log(`nucleo em lockstep: ${atual}`)
```

- [ ] **Step 2: Acrescentar o script que marca o dist-tag**

Em `repos/erp-nucleo/package.json`, dentro de `scripts`:

```json
    "marcar-lockstep": "pnpm dlx npm dist-tag add @erp/nucleo@$npm_package_version lockstep --registry http://localhost:4873"
```

- [ ] **Step 3: Marcar e verificar que passa**

Run:
```bash
cd repos/erp-nucleo && pnpm marcar-lockstep
cd ../erp-shell && node scripts/verificar-lockstep.mjs
cd ../erp-mfe-pedidos && node scripts/verificar-lockstep.mjs
```
Expected: `nucleo em lockstep: 0.1.0` nos dois.

- [ ] **Step 4: Confirmar que o gate reprova de verdade**

Run:
```bash
cd repos/erp-shell
sed -i 's/"@erp\/nucleo": "0.1.0"/"@erp\/nucleo": "0.0.9"/' package.json
node scripts/verificar-lockstep.mjs; echo "codigo de saida: $?"
sed -i 's/"@erp\/nucleo": "0.0.9"/"@erp\/nucleo": "0.1.0"/' package.json
```
Expected: `nucleo fora de lockstep: 0.0.9 != 0.1.0` e `codigo de saida: 1`.

- [ ] **Step 5: Commit**

```bash
cd repos/erp-shell && git add -A && git commit -m "chore: add lockstep gate for the core package"
cd ../erp-mfe-pedidos && git add -A && git commit -m "chore: add lockstep gate for the core package"
cd ../erp-nucleo && git add -A && git commit -m "chore: add lockstep dist-tag script"
```

---

## Critério de pronto da fatia 1

Todas as caixas acima marcadas, e com registry, stub, shell e zona no ar:

1. `@erp/contratos@0.1.0` e `@erp/nucleo@0.1.0` instalados a partir do Verdaccio
2. não autenticado em `/pedidos/8821` → redirect para `/login`
3. **C1**: `gabrigas`, `marina`, `rafael` e `carla` recebem os quatro resultados distintos
4. **C7**: revogado o grupo, a próxima leitura devolve `404` neutro
5. invariantes 1, 2, 3, 6 e 7 verdes; fronteira e exports verdes
6. `verificar-lockstep.mjs` passa nos dois consumidores
7. trocar `API_BASE_URL` não exige mudar nenhum arquivo de `erp-mfe-pedidos`

## O que esta fatia deliberadamente não faz

Núcleo **4** (Server Action com `If-Match`) e **8** (trace contínuo) ficam para a rodada 2 — são núcleo ausente, não extensão, e a base **não aceita escrita** até fecharem. `erp-ui`, SSE, cache de cliente, telemetria de navegador e atualização otimista são extensões e saem por definição.

O invariante **6** é provado no Step 6 da Task 10, contra a ilha `AcoesDoPedido`. É o único
que não se verifica em runtime — a prova é o build falhar, e por isso o passo exige conferir
o código de saída em vez de ler a mensagem.
