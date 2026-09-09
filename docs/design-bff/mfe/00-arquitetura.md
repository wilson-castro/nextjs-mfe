---
doc: mfe-00-arquitetura
data: 2026-09-09
publico: [humano, agente]
pre_requisito: ../comum/AGENTS.md
status: desenho completo; ver §12 para o que continua aberto
---

# 00 — Arquitetura da solução

Desenho arquitetural completo do ERP em micro front-ends. O documento
[`../comum/`](../comum/AGENTS.md) descreve o BFF de **uma** aplicação; este descreve o que
acontece quando são **várias**, cada uma com time e ciclo de deploy próprios.

O caso é o de [`00-caso.md`](../comum/docs/00-caso.md): pedido de compra `8821`, quatro
atores, um bloco sensível com ACL própria. Ele não é ilustração — é o critério de aceite.

> **O desenho tem três partes.** Este responde *como a solução é feita*.
> [`01-operacao.md`](01-operacao.md) responde *como ela roda*: roteamento, ambientes,
> sessão ponta a ponta, navegação, falha, testes e deploy. [`02-zonas.md`](02-zonas.md)
> responde *o que cada time precisa saber*: estrutura de uma zona, o contrato do
> fragmento, propriedade e como criar uma zona nova.

> **O que este documento não refaz.** Camadas, núcleo, extensões, segurança e
> observabilidade estão definidos em `../comum/`. Aqui só aparece o que **muda** por haver
> mais de uma zona, e o que é novo por causa disso.

---

## 1. A decisão que organiza tudo

Micro front-end tem duas famílias de solução, e elas falham em lugares diferentes:

| | Module Federation (cliente) | Multi-Zones (servidor) |
|---|---|---|
| Onde o fragmento é montado | navegador | servidor |
| Quando a autorização é avaliada | **depois** de o código chegar ao navegador | **antes** de qualquer byte sair |
| Compartilha React em runtime | sim | não |
| Isolamento de falha | do próprio consumidor | por processo |

A segunda linha decide. O invariante 2 diz que dado sensível não pode existir no processo
errado; num fragmento federado no cliente, o componente do módulo Comercial chega ao
navegador do `gabrigas` — que não tem `COMERCIAL-NORDESTE` — antes de alguém perguntar se
ele pode vê-lo.

**Multi-Zones + App Router é a base.** Registrado em
[ADR-0008](../comum/docs/adr/0008-multi-zones-como-base-mfe.md), junto do custo aceito.

---

## 2. Topologia

### 2.1 Repositórios

| Repositório | Entrega | Publica | Time |
|---|---|---|---|
| `erp-contratos` | `@erp/contratos` | registry | plataforma |
| `erp-nucleo` | `@erp/nucleo` | registry | plataforma |
| `erp-ui` | `@erp/ui` | registry | design system |
| `erp-shell` | `demo-erp` — gateway | deploy | plataforma |
| `erp-mfe-pedidos` | zona `/pedidos/*` | deploy | Pedidos |
| `erp-mfe-estoque` | zona `/estoque/*` | deploy | Logística |
| `erp-mfe-comercial` | zona `/comercial/*` | deploy | Comercial |

A separação por repositório não é preferência de organização: foi escolhida porque os
times e os ciclos de deploy são separados. O preço é o deploy atômico, e o substituto é o
gate de lockstep (§10.2).

### 2.2 Zonas e domínios

Cada zona é uma aplicação Next completa, com BFF próprio, falando com **um** domínio.

```
                       navegador
                           │
                    ┌──────┴──────┐
                    │  erp-shell  │  gateway · sessão · SSE · telemetria
                    └──────┬──────┘
        ┌──────────────────┼──────────────────┐
   /pedidos/*         /estoque/*         /comercial/*
        │                  │                  │
   BFF Pedidos       BFF Estoque       BFF Comercial
        │                  │                  │
   dom. Pedidos      dom. Logística     dom. Comercial
```

**Uma zona nunca fala com o domínio de outra.** Precisando de dado alheio, ela pede um
**fragmento** à zona dona (§6) — que aplica a ACL do próprio domínio antes de responder.
Isso mantém a autoridade onde o invariante 2 a colocou.

### 2.3 O que o shell nunca delega

Rewrite por prefixo é a regra; estas rotas são exceção explícita, e configurá-las errado é
silencioso:

| Rota | Por quê |
|---|---|
| `/api/auth/*` | a sessão é do domínio inteiro, não de uma zona |
| `/api/stream` | uma conexão SSE por aba, não uma por zona |
| `/api/otel/*` | o proxy de telemetria controla taxa e atributos num lugar só |
| `/login`, `/erro-de-zona` | precisam existir mesmo com toda zona fora do ar |

Tudo o mais segue o prefixo. Assets de cada zona vivem sob prefixo exclusivo
(`/pedidos-static/*`), porque duas zonas servindo `/_next` colidem.

---

## 3. As camadas, atravessando zonas

As três camadas de [`01-camadas.md`](../comum/docs/01-camadas.md) — Cliente, BFF, Domínio —
valem dentro de cada zona, sem mudança. O que a arquitetura MFE acrescenta é uma **quarta
fronteira, horizontal**: entre zonas.

```
┌─────────────────────────────────────────────────────────┐
│ CLIENTE          navegador · uma aba · um SharedWorker   │
├───────────┬───────────────┬─────────────────────────────┤
│ BFF Ped.  │  BFF Est.     │  BFF Com.    ← fronteira     │
│           │               │                 entre zonas  │
├───────────┴───────────────┴─────────────────────────────┤
│ DOMÍNIOS         Pedidos · Logística · Comercial         │
└─────────────────────────────────────────────────────────┘
```

A fronteira entre zonas é **hostil nos dois sentidos**. Uma zona não confia no que a outra
manda e não assume que a outra está no ar. As duas consequências disso são o fragmento
(§6) e o circuit breaker (§6.2).

---

## 4. O núcleo, completo

`@erp/nucleo` implementa os oito elementos de [`02-nucleo.md`](../comum/docs/02-nucleo.md).
A arquitetura MFE muda **como** três deles são entregues:

| # | Elemento | O que muda com várias zonas |
|---|---|---|
| 1 | Sessão opaca no servidor | store **compartilhado** entre zonas — Redis deixa de ser escolha e vira requisito (§4.2) |
| 2 | Autorização só no domínio | inalterado; é o que sustenta a §2.2 |
| 3 | Composição no servidor | ganha a forma **entre zonas**: `FragmentoRemoto` (§6) |
| 4 | Mutação por Server Action com `If-Match` | inalterado |
| 5 | Erro normalizado | passa a normalizar também falha **de zona**, não só de domínio |
| 6 | Isolamento `server-only` | inalterado |
| 7 | Allowlist de destino outbound | ganha uma segunda allowlist: **zonas** são destinos (§6.1) |
| 8 | Trace contínuo | quebra na travessia de zona; ver §9.2 |

### 4.1 Camadas do pacote

```
@erp/nucleo
  portas/          dados · sessão · identidade          ← só interfaces
  adaptadores/     http · redis · oidc · fakes           server-only
  fabricas/        criarNucleo · criarProxy · criarFragmento
  interno/         erros · otel · upstream               server-only
  permissoes/      pode()                                ← única exceção sem server-only
```

Três portas, e só três — aquelas cuja variação já existe. A regra de dependência
(`interno/` não alcança `adaptadores/`; nada de fora alcança `interno/`) é verificada por
lint, não por convenção, e os `exports` do pacote publicam exatamente três subpaths.

**Por que fábricas e não helpers.** `proxy.ts` não atravessa zonas. Sem
`criarProxy(config)`, cada uma das três zonas reimplementaria checagem de sessão e CSP, e
elas divergiriam — não de uma vez, mas ao longo de meses, que é pior. A fábrica torna o
`proxy.ts` de cada zona uma linha.

### 4.2 Sessão entre zonas

O cookie `__Host-session` é de domínio inteiro, então atravessa zonas sem esforço. O que
**não** atravessa é a memória do processo: a sessão gravada pelo shell precisa ser legível
pela zona, e são processos distintos.

> Consequência arquitetural: **o store de sessão é infraestrutura compartilhada**, e é o
> único ponto onde as zonas se tocam fora do gateway. Redis, por
> [ADR-0002](../comum/docs/adr/0002-redis-como-store-de-sessao.md). Um store em memória
> não é uma variante mais simples — é uma que não funciona.

---

### 4.3 O erro normalizado tem dois campos, e ambos atravessam

O elemento 5 existe para que nada da implementação do domínio chegue ao chamador. Na
prática ele deixa passar exatamente **dois** campos: `codigo` e `supportId`.

É fácil validar só o primeiro. `codigo` é conferido contra uma lista fechada — qualquer
valor desconhecido vira `ERRO_INTERNO`. `supportId` não tem lista fechada, e por isso a
tentação é repassá-lo como veio.

> **Regra.** Todo campo que atravessa a fronteira de erro é validado, não só o que tem
> lista. Um `supportId` sem verificação de tipo e de tamanho é um canal aberto: o domínio
> pode pôr ali o stacktrace que o `codigo` impediu de passar, e o teste que prova que
> `message` não vaza continua verde.

Vale para a falha de zona pela mesma razão: uma zona não confia no que a outra manda
(§3), e um fragmento que falha devolve erro pelo mesmo caminho.

**Validar formato não é validar sentido — e há um desenho mais forte.** Uma regex que
aceita `[A-Za-z0-9_-]{1,64}` barra um stacktrace inteiro, mas deixa passar um nome de
classe sem pontuação, um blob base64url e um hostname interno: os três cabem no formato.
O desenho que elimina a classe toda é o BFF **cunhar** o próprio `supportId` e registrar a
correlação no log, em vez de aceitar o do domínio — aí nada do corpo alheio atravessa. Não
adotado: mudaria o contrato que [`00-caso.md`](../comum/docs/00-caso.md) §C8 descreve.
Registrado como risco residual conhecido e limitado.

---

## 5. Contratos e design system

### 5.1 `@erp/contratos`

Tipos, códigos de erro e contrato de evento. Semver com janela de depreciação de duas
minors. A lista de ações é **fonte única** e o tipo deriva dela — duas listas escritas à
mão divergem, e uma enumeração desatualizada esconde uma ação da interface pelo mesmo
mecanismo silencioso que um `Partial` esconde uma permissão.

`_permissoes` é `Record` completo, nunca `Partial`. Bloco sensível é propriedade
**opcional**, e sua ausência é ausência da chave — o que exige
`exactOptionalPropertyTypes: true` no `tsconfig` **de quem consome**, não de quem publica.
Um `.d.ts` não impõe essa flag; a arquitetura impõe, por convenção verificada.

### 5.2 `@erp/ui`

Tokens, primitivos `'use client'` e padrões de layout. Semver tolerante: divergência
visual entre zonas é feia, não perigosa — ao contrário do núcleo, onde divergência é falha
de segurança.

**`@erp/ui` é o único pacote que dói no Multi-Zones.** Sendo componentes de cliente, ele é
baixado uma vez por zona. Quem navega Pedidos → Estoque → Comercial baixa React e o design
system três vezes. É a limitação 3, e é a única que a arquitetura não resolve — só mede e
decide (§12.1).

---

## 6. Composição entre zonas — `FragmentoRemoto`

O caso exige que a tela de Pedidos mostre a `CondicaoComercial`, que é do domínio
Comercial e tem ACL própria. A zona Pedidos **não pode** consultar o domínio Comercial:
isso moveria a autoridade de lugar.

Ela pede um fragmento à zona Comercial, no servidor:

```
RSC da zona Pedidos
  → GET https://comercial.interno/comercial/_fragmento/condicao/8821
    cabeçalho: a sessão do usuário
    → BFF Comercial resolve a sessão, chama o domínio Comercial
      → domínio decide: marina vê, gabrigas não
    ← HTML já renderizado, ou 204 quando não autorizado
  → embute no fluxo de renderização
```

Três propriedades caem disso, e nenhuma é acidental:

1. **A ACL é avaliada pelo dono do dado**, antes de qualquer byte sair. O `gabrigas` não
   recebe HTML vazio nem marcador — recebe ausência total.
2. **Nada sensível transita em serialização de cliente.** O fragmento é HTML pronto, não
   um DTO que uma ilha recompõe.
3. **A falha é isolável**, porque é uma chamada de rede com timeout — não um `import`.

### 6.1 O fragmento é destino outbound

Zonas são destinos de saída, e o elemento 7 vale para elas: **nenhuma parte da URL de um
fragmento pode vir do cliente.** O mapa de zonas é configuração do servidor; o identificador
do recurso é codificado, nunca concatenado. `criarFragmento(config)` carrega essa allowlist,
pelo mesmo motivo que `criarProxy` carrega a política de CSP.

### 6.2 O circuit breaker é obrigatório, não estético

Multi-Zones **não tem** primitiva de degradação entre zonas. Não existe "esta zona está
fora, degrade". O que existe é o que este desenho colocar.

```tsx
<Suspense fallback={<EsqueletoDoBloco />}>
  {/* try/catch + AbortSignal.timeout(2000) DENTRO do fragmento */}
  <FragmentoRemoto zona="comercial" caminho={`/condicao/${id}`} />
</Suspense>
```

> **Regra.** O `try/catch` e o timeout do `FragmentoRemoto` são **núcleo**, não
> boilerplate. Removê-los faz a queda do Comercial derrubar a renderização do Pedidos —
> uma zona levando outra junto é exatamente a falha que o isolamento por processo existia
> para impedir. Aplicando o teste de desligamento: desligue o `try/catch` e uma resposta
> muda. Logo, não é extensão.

Isso é o elemento 3 do núcleo na sua forma entre zonas, não um nono elemento.

---

## 7. Estado de cliente entre zonas

Navegação entre zonas é sempre **hard navigation** — o documento é destruído e outro nasce.
Não há como contornar; é o mecanismo que dá a independência de deploy.

Isso derruba tudo que vivia na memória do documento: cache de consulta, estado de ilha,
conexão SSE. O desenho responde em dois níveis:

| O que sobrevive | Como |
|---|---|
| conexão SSE | `SharedWorker` — vive no `origin`, não no documento |
| sessão | cookie + store compartilhado |
| filtro, aba aberta, rascunho | não sobrevive, e **não deve** — é estado de tela |

### 7.1 O `SharedWorker` multiplexa por documento

O worker sobrevive à travessia, mas a porta que o documento antigo segurava morre com ele.
Cada zona precisa do próprio bootstrap do `StreamProvider`, e o worker precisa descartar
portas mortas sem derrubar a conexão SSE das vivas.

```
zona A descarrega  → worker vivo, SSE mantido
                   → zona B monta → abre porta NOVA
                   → worker multiplexa entre portas de DOCUMENTOS distintos,
                     não só entre abas da mesma zona
```

É mais estado do que "uma conexão por navegador" sugeria, e é a limitação 1.

### 7.2 `<Link>` não atravessa zona

`<Link>` para fora do próprio prefixo falha **em silêncio**: não erra, tenta soft-navegar,
o roteador não acha a rota e o comportamento varia conforme o estado. Passa em revisão de
código porque parece certo.

> **Invariante.** Nenhum `<Link>` aponta para fora do prefixo da própria zona. `<a>` puro
> entre zonas. Verificado por lint contra o mapa de prefixos — um invariante sem
> verificação é intenção.

---

## 8. Extensões

Inalteradas em natureza; o que muda é que agora cada uma precisa funcionar **três vezes**
ou **uma vez no shell**. Isso é decisão arquitetural, não detalhe.

| Extensão | Onde vive | Se desligar |
|---|---|---|
| Tempo real (SSE) | **shell** — uma conexão | a tela atualiza na navegação, não em ~2 s |
| CSP com nonce | cada zona, via `criarProxy` | política mais fraca contra XSS |
| Cache de cliente | cada zona | refetch a cada montagem |
| Atualização otimista | cada zona | o usuário espera o HTTP |
| Telemetria de navegador | **shell** — um proxy | o trace começa no BFF |

Regra que decide onde uma extensão nova vive: **se ela precisa de identidade única por
usuário, vive no shell; se é comportamento de tela, vive na zona.** Uma conexão SSE por
zona multiplicaria por três o custo no domínio sem entregar nada.

---

## 9. Preocupações transversais

### 9.1 Segurança

As quatro camadas de verificação de [`06-seguranca.md`](../comum/docs/06-seguranca.md)
valem por zona, e **só a quarta é segurança**. A camada 1 (`proxy.ts`) faz zero I/O e só
olha presença de cookie — ela roda em toda requisição, inclusive prefetch, e I/O ali
multiplica carga por quanto o usuário passa o mouse sobre links. Um cookie forjado passa
dela; a camada 2 pega.

O que a arquitetura MFE acrescenta ao modelo de ameaça:

| Ameaça nova | Mitigação | Limite |
|---|---|---|
| Zona pedindo dado de domínio alheio | fragmento, nunca acesso direto | disciplina + revisão |
| Fragmento forjado por cliente | allowlist de zona (§6.1) | — |
| Uma zona derrubando outra | timeout + `try/catch` obrigatórios | — |
| Divergência de política entre zonas | `criarProxy` + lockstep do núcleo | não é impedimento nativo |

### 9.2 Observabilidade — e onde o trace quebra

O proxy de telemetria é do shell, com taxa e atributos controlados num lugar só. Dentro de
uma zona, o trace é contínuo do navegador ao domínio.

**Entre zonas, não é.** Hard navigation destrói o documento, e com ele o contexto de trace
do navegador. A jornada `/pedidos/8821` → `/comercial/contratos/88` são **dois traces**,
não um.

> Isto é limitação estrutural, não lacuna de implementação. Correlacioná-los exige um
> identificador de jornada carregado no cookie de sessão e anexado como atributo — o que é
> possível, mas ainda **não decidido** (§12.3). Nenhum documento deve descrever o trace
> como contínuo entre zonas até que esteja.

### 9.3 Desempenho

O modelo de [`08-desempenho.md`](../comum/docs/08-desempenho.md) vale por zona: o BFF ganha
a partir de duas chamadas dependentes, e a co-localização com o domínio (`RTT_lan ≈ 1 ms`)
é a premissa que sustenta tudo. Violá-la — BFF numa região, domínio noutra — leva uma tela
de `n=4` de ~115 ms para ~675 ms, pior que a SPA que o BFF substituiu.

O que a arquitetura MFE acrescenta é **custo de travessia**: React e `@erp/ui` baixados uma
vez por zona (limitação 3), e nenhum code-splitting cruzado (limitação 9). O fragmento não
sofre disso — é chamada de rede, não `import`.

> Aquele documento é modelo analítico e diz de si mesmo que não serve como evidência de
> capacidade. Os números de travessia acima **não foram medidos** (§12.1).

---

## 10. Versão e deploy

### 10.1 Política por pacote

| Pacote | Política | Por quê |
|---|---|---|
| `@erp/nucleo` | **lockstep** — todos na mesma minor | dois contratos de erro ou duas allowlists no mesmo produto é falha de segurança |
| `@erp/contratos` | semver, depreciação de 2 minors | quebrar tipo derruba consumidor |
| `@erp/ui` | semver tolerante | divergência visual é feia, não perigosa |

### 10.2 Deploy

Ordem de publicação: **contratos → núcleo → ui → zonas**. Não há deploy atômico — é o
preço do multi-repo, e o gate de lockstep no CI é o substituto: um PR que atualiza
`@erp/nucleo` numa zona e não nas outras **falha**.

Zonas sobem em momentos diferentes. Se a Comercial publicar uma ação nova antes de a
Pedidos atualizar `@erp/contratos`, a ação simplesmente não aparece na interface da
Pedidos até o deploy dela. Isso é aceitável e precisa ser **decisão consciente**,
documentada no contrato de versão — não descoberta em produção.

---

## 11. As onze limitações, respondidas

| # | Limitação | Resposta desta arquitetura |
|---|---|---|
| 1 | Hard navigation derruba o documento | `SharedWorker` multiplexando portas por documento (§7.1) |
| 2 | `<Link>` falha em silêncio entre zonas | invariante + lint contra o mapa de prefixos (§7.2) |
| 3 | Sem dedup de bundle | **não resolvida** — medir e decidir (§12.1) |
| 4 | `proxy.ts` não atravessa zonas | fábrica `criarProxy`, não helpers (§4.1) |
| 5 | `basePath` colide com `/api/bff` | rota da zona é `app/{zona}/api/bff/` |
| 6 | Rewrite não sabe de rotas do shell | exceções explícitas (§2.3) |
| 7 | Cookie de rota restrita | nenhum cookie com `path` restrito; `__Host-` é de domínio |
| 8 | Contrato assíncrono entre deploys | janela de depreciação + decisão consciente (§10.2) |
| 9 | Sem code-splitting cruzado | aceito — fragmento é HTTP, não `import` |
| 10 | Sem deploy atômico | aceito — gate de lockstep substitui (§10.2) |
| 11 | Sem circuit breaker nativo | `try/catch` + timeout marcados **núcleo** (§6.2) |

---

## 12. O que continua aberto

Nenhum destes tem resposta ainda. Registrados para não serem lidos como resolvidos.

### 12.1 Module Federation restrito à `@erp/ui`

A limitação 3 é a única que a arquitetura não resolve. MF **só para a UI** a resolveria sem
reintroduzir o problema de autorização, porque componente de design system não carrega dado
sensível.

**Critério que decide:** medir os bytes efetivamente rebaixados numa travessia
Pedidos → Estoque → Comercial, com cache do navegador quente e frio. Se a duplicação for
irrelevante na rede real dos usuários, a complexidade de MF não se paga. Decisão adiada
**até haver medição** — e a medição é do `simulador-condicoes`.

### 12.2 Lock de refresh × política do IdP

[PENDENCIAS §4](../comum/docs/PENDENCIAS.md), **aberta, bloqueia produção**. Com várias
zonas o problema piora: três processos podem tentar renovar a mesma sessão ao mesmo tempo.
Depende de perguntas ao IdP que ainda não foram feitas.

### 12.3 Correlação de trace entre zonas

§9.2. Exige identificador de jornada no cookie, anexado como atributo — sem PII. Não
desenhado.

### 12.4 Limite de taxa e admission control

[PENDENCIAS §7](../comum/docs/PENDENCIAS.md), **aberta**. O modelo de ameaça marca
enumeração por identificador sequencial como *não impedida* sem limite de taxa, e
distinção por tempo de resposta como **não mitigada**. Com o gateway no shell, há um lugar
natural para isso — mas não há desenho.

---

## 13. Como o caso exercita a arquitetura

Cada cenário de [`00-caso.md`](../comum/docs/00-caso.md) existe para tornar observável uma
decisão. O mapa:

| Cenário | Mecanismo que ele prova | Rodada |
|---|---|---|
| C1 — mesma rota, payloads diferentes | projeção no domínio; ausência total | 1 |
| C3 — estado derivado vem do domínio | `_permissoes` como fonte da UI | 1 (leitura) |
| C7 — acesso revogado na sessão | `404` neutro; autorização não congela no login | 1 |
| C8 — dois editam a mesma versão | `If-Match`; erro normalizado | 2 |
| C4 — usuário altera dependência | Server Action; propagação | 2 |
| C9 — exclusão | mutação + reação a `recurso.excluido` | 2 |
| C2 — evento externo em dependência | SSE; `SharedWorker` entre zonas | 3 |
| C6 — mudança em bloco sensível | ACL na **emissão**, não só na leitura | 3 |
| C5 — alteração em outra listagem | evento fino; otimismo local | 3 |

### Rodadas

| Rodada | Entrega | Destrava |
|---|---|---|
| **1** | contratos, núcleo (leitura), shell, zona Pedidos, stub | C1, C3, C7 — e a base **não aceita escrita** |
| **2** | núcleo 4 e 8; domínio real | C4, C8, C9 — a base passa a aceitar escrita |
| **3** | SSE, `SharedWorker`, segunda zona | C2, C5, C6 — e revela o que só aparece com duas zonas |
| **4** | `@erp/ui`, terceira zona | decide §12.1 com medição |

A rodada 1 está especificada em
[`../../superpowers/specs/2026-09-09-base-mfe-multizone-design.md`](../../superpowers/specs/2026-09-09-base-mfe-multizone-design.md).

> **Ausência não é opcionalidade.** Os elementos 4 e 8 do núcleo estão fora da rodada 1 e
> continuam sendo **núcleo**. Nenhum documento pode descrevê-los como extensões, e nenhuma
> zona expõe mutação antes da rodada 2.
