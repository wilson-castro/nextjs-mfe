---
doc: spec-base-mfe-multizone
data: 2026-09-09
publico: [humano, agente]
pre_requisito: docs/design-bff/comum/AGENTS.md
status: aprovado para plano
---

# Base MFE Multi-Zones — desenho da rodada 1

Este documento desenha a **base** sobre a qual os micro front-ends do produto passam a ser
construídos: quais repositórios existem, que camadas o núcleo tem, como uma camada é
trocada ou estendida sem tocar em código de aplicação, e o que precisa estar rodando para
a base ser considerada provada.

Ele substitui, para efeito de implementação, a estrutura do PoC atual
(`apps/host` + `apps/remote`, Pages Router + Module Federation). O PoC permanece no
repositório como referência histórica; nenhuma linha dele é reaproveitada.

---

## 1. Por que a estrutura atual não serve

`docs/design-bff/mfe/ideia-mfe` registra três fatos sobre `@module-federation/nextjs-mf`
— sem suporte a App Router, fim de vida anunciado, e plugin webpack num ecossistema que
migrou para Turbopack. Nenhum deles é decisivo sozinho.

O decisivo é estrutural: Pages Router serializa props via `getServerSideProps` para
`__NEXT_DATA__`, no HTML. O invariante 2 do `AGENTS.md` diz o oposto. No App Router isso é
disciplina sobre um caso específico; no Pages Router é **o mecanismo padrão de toda
página**. Com ele caem junto os elementos 3 (composição no servidor), 4 (Server Action) e
6 (`server-only` como fronteira de compilação) do núcleo.

Adotar MF significaria reconstruir o núcleo inteiro e chegar a um resultado
estruturalmente menos seguro. A escolha é **Multi-Zones + App Router**.

## 2. Decisões desta rodada

Registradas formalmente em [ADR-0008](../../design-bff/comum/docs/adr/0008-multi-zones-como-base-mfe.md)
e indexadas em `05-decisoes.md`. A tabela abaixo é o resumo.

| Decisão | Escolha | Razão |
|---|---|---|
| Distribuição | multi-repo desde o commit 1 | times e ciclos de deploy separados; restrição organizacional, não preferência |
| Registry | Verdaccio local | encanamento de publicação isolado atrás de `.npmrc`; troca para registry real não toca aplicação |
| Superfície do núcleo | fábricas configuradas + 3 portas | portas onde a variação já é conhecida; nas demais peças, código concreto |
| Domínio da fatia 1 | stub HTTP servindo o caso de `00-caso.md` | o caso já define recursos, atores e projeção esperada; a porta permite apontar para o domínio Spring Boot real depois |
| Localização em disco | `nextjs-mfe/repos/*` | um diretório só durante o desenvolvimento; cada repo com `.git` próprio |

### 2.1 O custo aceito do multi-repo

O item 10 de `limitações-mfe-multizone.md` registra que multi-repo **descarta o deploy
atômico**. O gate de lockstep no CI é o que substitui essa atomicidade. Esta rodada aceita
esse custo conscientemente, e a seção 7 define o gate.

### 2.2 Por que não hexagonal por igual

A jogada da arquitetura hexagonal é domínio no centro, adaptadores na borda. Neste desenho
o domínio **não está neste código** — está na JVM, e o invariante 2 dá a ele autoridade
exclusiva sobre acesso e regra. Um BFF hexagonal completo teria o hexágono vazio: nenhuma
lógica de negócio para proteger, por construção.

Portas existem, portanto, apenas nas fronteiras onde a variação já existe hoje:

| Fronteira | Variação conhecida | Porta? |
|---|---|---|
| Dados de domínio | stub do caso agora, domínio Spring Boot depois | sim |
| Store de sessão | memória em dev, Redis em prod (ADR-0002) | sim |
| Provedor de identidade | OIDC trocável por ambiente | sim |
| `upstream/` | é o adaptador; nada a abstrair atrás dele | não |
| `erros/`, `otel/`, `permissoes/` | funções puras e constantes | não |

Porta especulativa é indireção sem consumidor. O `02-nucleo.md` registra o custo desse
erro no caso do cache: um componente que parecia opcional atravessando quatro subsistemas.

---

## 3. Topologia de repositórios

Cinco repositórios em `nextjs-mfe/repos/`, cada um com `.git` próprio. O diretório `repos/`
entra no `.gitignore` do repositório externo.

| Repositório | Entrega | Publica | Depende de |
|---|---|---|---|
| `erp-contratos` | `@erp/contratos` | Verdaccio | — |
| `erp-nucleo` | `@erp/nucleo` | Verdaccio | `@erp/contratos` |
| `erp-shell` | app `demo-erp`, porta 3000 | não | ambos |
| `erp-mfe-pedidos` | zona `/pedidos/*`, porta 3001 | não | ambos |
| `erp-dominio-stub` | servidor HTTP, porta 4000 | não, dev-only | — |

`erp-ui` fica fora desta rodada. Nenhum dos invariantes provados aqui depende dele, e a
limitação 3 estabelece que ele será duplicado por zona de qualquer forma — decisão que
merece medição antes de virar repositório.

### 3.1 Política de versão

| Pacote | Política | Por quê |
|---|---|---|
| `@erp/nucleo` | lockstep — todos os consumidores na mesma minor | dois contratos de erro ou duas allowlists no mesmo produto é falha de segurança |
| `@erp/contratos` | semver, janela de depreciação de 2 minors | quebrar tipo derruba módulo consumidor |

---

## 4. Camadas do `@erp/nucleo`

```
@erp/nucleo
  portas/          só interfaces, nenhuma implementação
    dados.ts         PortaDeDados
    sessao.ts        StoreDeSessao
    identidade.ts    ProvedorDeIdentidade
  adaptadores/     implementações trocáveis
    dados-http.ts                                        server-only
    sessao-memoria.ts / sessao-redis.ts                  server-only
    identidade-oidc.ts                                   server-only
  fabricas/        superfície pública
    criarNucleo.ts   config + adaptadores → { sessao, dados }
    criarProxy.ts    sessão + nonce de CSP
  interno/         concreto, sem porta
    erros/ otel/ upstream/                               server-only
    permissoes/    única exceção sem server-only
  testing/         adaptadores fake
```

`permissoes/` fica no núcleo **sem** `server-only` porque as ilhas `'use client'` precisam
dele para montar menu e habilitar botão. É a única exceção, e está documentada aqui para
que ninguém a leia como esquecimento.

### 4.1 Regra de dependência

- `interno/` nunca importa de `adaptadores/` nem de `portas/`
- `adaptadores/` importa de `portas/` e `interno/`
- `fabricas/` costura os três
- `testing/` não é importado fora de teste

Verificada por lint de fronteira, não por convenção. Convenção diverge; lint falha o build.

### 4.2 Exports

O `package.json` publica exatamente quatro subpaths:

| Subpath | Conteúdo | Ambiente |
|---|---|---|
| `@erp/nucleo` | fábricas, fábricas de adaptador, tipos, classes de erro | servidor |
| `@erp/nucleo/proxy` | `criarProxy` | runtime do Next |
| `@erp/nucleo/permissoes` | `pode()` | isomórfico |
| `@erp/nucleo/testing` | adaptadores fake | teste |

**`criarProxy` tem subpath próprio por necessidade, não por gosto.** O Next 16 não publica
campo `exports`, e sob ESM um subpath sem extensão em pacote sem `exports` não resolve —
na compilação **e** em runtime. Na raiz, ele faria `import('@erp/nucleo')` arrastar
`next/server` e tornaria o pacote impossível de carregar em Node puro, incluindo nos
próprios testes dele. Descoberto na implementação, não no desenho.

Os adaptadores são expostos apenas como fábricas nomeadas reexportadas pela raiz —
`dadosHttp`, `sessaoArquivo`, `identidadeDev` na rodada 1; `sessaoRedis` e `oidc` na rodada 2.
Seus módulos não têm subpath próprio,
e `interno/` não é alcançável de forma alguma. É isso que impede uma zona de chamar
`upstream()` direto e furar a allowlist do elemento 7.

### 4.3 O consumo, inteiro

```ts
// erp-mfe-pedidos/lib/nucleo.ts
import { criarNucleo, dadosHttp, sessaoRedis, oidc } from '@erp/nucleo'

export const nucleo = criarNucleo({
  dados:      dadosHttp({ baseUrl: process.env.API_BASE_URL! }),
  sessao:     sessaoArquivo({ dir: process.env.SESSAO_DIR! }),   // rodada 1; sessaoRedis na 2
  identidade: identidadeDev({ }),                                // rodada 1; oidc na 2
  lerCookieDeSessao: async () => (await cookies()).get('__Host-session')?.value,
})
```

```ts
// erp-mfe-pedidos/proxy.ts
import { criarProxy } from '@erp/nucleo'
import { nucleo } from './lib/nucleo'

export default criarProxy({ prefixo: '/pedidos', rotaLogin: '/login' })
```

Trocar o stub pelo domínio Spring Boot real é trocar `baseUrl`. Trocar Redis por memória é trocar um
adaptador. Adicionar uma zona é copiar essas duas linhas. Nenhuma dessas mudanças toca em
código de aplicação — é o que "genérico e extensível" significa neste desenho.

A fábrica `criarProxy` existe por causa da limitação 4: `proxy.ts` não atravessa zonas, e
sem fábrica cada MFE reimplementaria checagem de sessão e CSP, divergindo com o tempo.

**`criarProxy` não recebe o núcleo, e isso é deliberado.** `06-seguranca.md` §2 diz que a
camada 1 faz **zero I/O** — ela roda em toda requisição, inclusive prefetch de `<Link>`, e
uma leitura ali multiplica carga por quanto o usuário passa o mouse sobre links. Ela só
verifica **presença** de cookie; um cookie forjado passa, e a camada 2 pega. Dar o núcleo à
fábrica seria convidar I/O para dentro dela.

`lerCookieDeSessao` é injetado em vez de `criarNucleo` importar `next/headers` porque isso
mantém as fábricas testáveis fora de um contexto de requisição do Next.

---

## 5. A fatia vertical

```
:4873 verdaccio    :4000 stub    :3000 shell    :3001 zona pedidos

navegador → :3000 shell
  /login, /api/auth/*        shell: OIDC, grava __Host-session
  /api/stream, /api/otel     shell sempre; nunca delegado a zona
  /pedidos/*                 rewrite → :3001

:3001 zona pedidos (App Router, RSC)
  proxy.ts   exige __Host-session, injeta nonce de CSP
  page.tsx   nucleo.dados.lerPedido(id)
             → adaptador HTTP → :4000, Authorization: Bearer
             token montado e consumido dentro do processo Node
```

Duas consequências de configuração que são fáceis de errar:

- **Exceções de rewrite** (limitação 6): `/api/stream`, `/api/auth/*` e `/api/otel/*` não
  seguem a regra de prefixo por zona. São sempre do shell.
- **Rotas de API da zona** (limitação 5): vivem em `app/{zona}/api/bff/`, nunca em
  `app/api/bff/`, porque duas zonas colidiriam. O `AGENTS.md` **já foi corrigido**, com a
  justificativa registrada no próprio ponto da convenção e em `04-servicos.md` e
  `00-caso.md`. Convenção antiga em código é erro de revisão, não estilo.

### 5.1 O que a fatia 1 renderiza: o cenário C1

O alvo funcional é o caso de [`00-caso.md`](../../design-bff/comum/docs/00-caso.md) — um
ERP de compras — e a tela é `/pedidos/8821`. Dos nove cenários do caso, a fatia 1 cobre os
que são **somente leitura**:

| Cenário | Na fatia 1? | Por quê |
|---|---|---|
| **C1** — mesma rota, payloads diferentes | **sim** | é a prova da projeção no domínio e da ausência de mascaramento no BFF |
| **C3** — estado derivado e capacidades vêm do domínio | **parcial** | a leitura de `_permissoes` entra; a revalidação por evento é extensão |
| **C7** — acesso revogado durante a sessão | **sim** | duas leituras e um `404` neutro; não exige escrita |
| C2, C6 | não | dependem de SSE, que é extensão |
| C4, C5, C8, C9 | não | dependem de mutação — núcleo 4, rodada 2 |

**C1 é a fatia.** Ele exercita, numa tela só, os cinco invariantes que a rodada 1 prova, e
os quatro atores do caso dão a ele quatro resultados observáveis distintos:

| Ator | Grupos | `/pedidos/8821` deve devolver |
|---|---|---|
| `gabrigas` | `OPS-NORDESTE` | conteúdo operacional, **sem nenhum campo de `CondicaoComercial`** |
| `marina` | `OPS-NORDESTE`, `COMERCIAL-NORDESTE` | conteúdo operacional **e** a condição comercial |
| `rafael` | `OPS-NORDESTE`, role `ADMIN` | conteúdo operacional; role não concede o bloco comercial |
| `carla` | `OPS-SUL` | `404` — e o `404` não revela que o pedido existe |

`rafael` é o ator mais importante do conjunto e o mais fácil de errar: ele prova que
**role não é grupo**. Um desenho que confunde os dois entrega o bloco sensível ao admin.

### 5.2 O que o `erp-dominio-stub` precisa servir

O stub não é um mock de conveniência: ele é quem torna C1 falsificável. Precisa implementar,
no mínimo:

- `GET /pedidos/8821` com **projeção por ator** — o bloco `CondicaoComercial` ausente do
  corpo, não presente e vazio (§3.2 de `06-seguranca.md`: ausência total, sem placeholder)
- `404` para `carla`, idêntico em corpo e headers ao `404` de um id inexistente
- `_permissoes` como `Record` completo, nunca `Partial`, com valores booleanos
- `ETag` na resposta, ainda que a fatia 1 não escreva — é o insumo do `If-Match` da rodada 2
- recusa de requisição sem `Authorization`, sem descrever o motivo

A projeção acontece **no stub**, nunca no BFF. Se o BFF precisasse filtrar, o campo teria
existido em memória no processo errado.

### 5.3 Erros

`interno/erros` normaliza num lugar só: `401` dispara renovação de sessão, `403` vira
`OPERACAO_NAO_PERMITIDA`, `404` vira `notFound()`, `409` vira `Desatualizado`, e qualquer
outra falha vira `ERRO_INTERNO` com `supportId`. Nenhum detalhe de implementação do
domínio atravessa para o navegador.

Zona indisponível: o rewrite falha e o shell serve página de erro própria, não um 502 cru.

---

## 6. Testes de invariante

O `AGENTS.md` é explícito: invariante sem verificação é intenção. A fatia 1 só é considerada
provada quando estes testes passam.

| # | Invariante | Verificação |
|---|---|---|
| 1 | credencial nunca no navegador | varre HTML e todo JS servido em `/pedidos/8821` por `access_token`, `refresh_token`, `groups` — para os quatro atores |
| 2 | DTO sensível não vira prop de ilha | como `gabrigas`, nenhum campo de `CondicaoComercial` no HTML, no flight payload, em prop serializada ou em atributo `data-*`; lint proíbe DTO em props de `'use client'` |
| 3 | composição no servidor | o stub escuta só em `127.0.0.1` e exige um cabeçalho de dev que apenas o adaptador injeta; requisição partindo do navegador recebe `403` |
| 6 | `server-only` é fronteira de build | importar adaptador de dentro de `'use client'` **falha o build** |
| 7 | allowlist outbound | `//evil.com`, `../`, origin divergente → `DestinoInvalido` |

Mais dois testes estruturais, que são o que sustenta a extensibilidade:

- **lint de fronteira** entre `portas/`, `adaptadores/`, `fabricas/` e `interno/`
- **teste de exports**: `import '@erp/nucleo/interno/upstream'` deve quebrar

Mais os três do caso, que são o resultado observável 1 de `00-caso.md` §6:

- `gabrigas` e `marina` na **mesma rota** recebem payloads diferentes, e o de `gabrigas`
  não contém o bloco sensível em nenhuma camada de serialização
- `rafael`, apesar de `ADMIN`, também não o contém
- `carla` recebe `404` indistinguível do `404` de um id que nunca existiu

Testes que usam `@erp/nucleo/testing` rodam sem rede e sem stub. Os demais exigem o stub
no ar, com as quatro sessões.

---

## 7. Publicação e lockstep

Verdaccio em compose na porta 4873. Cada repositório traz `.npmrc` com
`@erp:registry=http://localhost:4873`. Ordem de publicação: **contratos → núcleo →
consumidores**.

O núcleo mantém um dist-tag `lockstep`. Cada consumidor roda `verificar-lockstep.mjs`,
que compara sua dependência `@erp/nucleo` com esse tag e falha se divergirem. É o gate
descrito em `ideia-mfe`, rodando local enquanto não há CI remoto — e é o que substitui o
deploy atômico que o multi-repo descartou.

---

## 8. Fora do escopo desta rodada

Extensões, por definição: `erp-ui`, SSE, cache de cliente, telemetria de navegador,
atualização otimista, CSP com nonce além do que `criarProxy` já injeta.

**Dois elementos de núcleo também ficam para a rodada 2.** Decisão confirmada, registrada
como ADR-0008 §9:

| # | Elemento | Consequência |
|---|---|---|
| 4 | mutação por Server Action com `If-Match` | a fatia 1 é **somente leitura** |
| 8 | trace contínuo sem dado pessoal | sem correlação ponta a ponta |

Ausência temporária não é opcionalidade. A base **não aceita escrita** até a rodada 2
fechar: nenhuma zona expõe Server Action de mutação, nenhum documento descreve esses dois
elementos como extensões, e o revisor de arquitetura reprova qualquer PR que introduza
escrita antes disso. É a mesma armadilha registrada em C-011 e ADR-0007.

---

## 9. Critério de pronto

A rodada 1 fecha quando, com Verdaccio, stub, shell e zona no ar:

1. `@erp/contratos` e `@erp/nucleo` estão publicados e instalados a partir do registry
2. um usuário não autenticado em `/pedidos/8821` é redirecionado para `/login` pelo shell
3. **C1 passa**: as quatro sessões do caso abrem `/pedidos/8821` e recebem exatamente os
   quatro resultados da tabela em §5.1 — incluindo `rafael` sem o bloco comercial
4. **C7 passa**: revogado o grupo de `gabrigas`, a próxima leitura devolve `404` neutro
5. os cinco testes de invariante, os dois estruturais e os três do caso passam
6. `verificar-lockstep.mjs` passa em ambos os consumidores
7. trocar `API_BASE_URL` do stub para o domínio Spring Boot real não exige mudança em
   nenhum arquivo de `erp-mfe-pedidos` fora de variável de ambiente

---

## 10. Agentes de projeto

Quatro subagentes em `.claude/agents/`, cada um cobrindo um ponto onde este desenho é
fácil de furar sem que ninguém perceba. Os três primeiros leem; o quarto executa:

| Agente | Quando | Autoridade |
|---|---|---|
| `arquiteto-mfe` | antes de escrever qualquer peça nova | aplica o teste núcleo/extensão, decide a camada, **recusa porta sem variação conhecida** |
| `revisor-mfe` | ao terminar tarefa, antes de commit ou merge | reprova vazamento, fronteira rompida, autoridade no lugar errado, restrição de zona violada e escrita na rodada 1 |
| `testes-invariantes` | ao implementar núcleo, porta, adaptador ou zona | mapeia a mudança para as sete verificações da §6, escreve as que faltam, confirma que cada uma falha pela razão certa antes de passar |
| `simulador-condicoes` | com o sistema de pé; antes de release | põe o sistema sob condição adversária, degradada e de carga; reporta observado × declarado, e só afirma o que executou |

Nenhum dos quatro escreve código de aplicação. O arquiteto não implementa; o revisor não
corrige; o de testes escreve teste, não produção; o simulador não conserta o que encontra.
A separação existe para que a revisão não seja feita por quem tomou a decisão revisada.

O `simulador-condicoes` tem um mandato que os outros não têm: **medir o que os documentos
admitem não ter medido.** `08-desempenho.md` se declara modelo analítico e proíbe seu uso
como evidência de p99; `11-testes.md` §8 lista o que nenhum teste cobre; `06-seguranca.md`
§1 marca três ameaças como não mitigadas. Essas lacunas são o escopo dele, e a medição de
duplicação de bundle entre zonas é o que destrava a questão em aberto do ADR-0008.

Ele opera só em `localhost`, só sobre processos que ele mesmo iniciou, e nunca aponta carga
ou sonda adversária para host remoto sem autorização explícita.

