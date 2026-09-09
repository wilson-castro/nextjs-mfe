---
doc: mfe-01-operacao
data: 2026-09-09
publico: [humano, agente]
pre_requisito: 00-arquitetura.md
status: desenho completo; ver §8 para o que continua aberto
---

# 01 — Operação: roteamento, ambientes, sessão, falha e deploy

Segunda metade do desenho. [`00-arquitetura.md`](00-arquitetura.md) responde *como a
solução é feita*; este responde *como ela roda, falha e evolui*.

Solução construída do zero, atendendo ao caso de [`00-caso.md`](../comum/docs/00-caso.md).
Não há sistema anterior, não há usuário a preservar e não há migração — o que existe é
**ordem de construção**, e o risco que ela controla é retrabalho, não regressão.

---

## 1. Roteamento

### 1.1 A tabela

O shell é o único host que o navegador conhece. Tudo entra por ele.

| Caminho | Destino | Observação |
|---|---|---|
| `/` , `/login`, `/erro-de-zona` | shell | precisam existir com toda zona fora |
| `/api/auth/*` | shell | sessão é do domínio inteiro |
| `/api/stream` | shell | uma conexão SSE por aba |
| `/api/otel/*` | shell | taxa e atributos num lugar só |
| `/pedidos`, `/pedidos/*` | zona Pedidos | inclui `/pedidos/api/bff/*` |
| `/estoque`, `/estoque/*` | zona Estoque | idem |
| `/comercial`, `/comercial/*` | zona Comercial | idem |
| `/{zona}-static/*` | zona correspondente | assets |

Duas armadilhas, ambas silenciosas:

- **A raiz da zona é uma regra separada.** `/pedidos/:path*` não casa com `/pedidos`. Sem
  a regra sem sufixo, a raiz da zona cai no 404 do shell.
- **As rotas do shell não podem ser cobertas por regra genérica.** Um rewrite `/(.*)`
  para uma zona padrão engoliria `/api/stream` e o SSE morreria sem erro visível.

### 1.2 Assets

Cada zona serve seus assets sob prefixo exclusivo — `assetPrefix: '/pedidos-static'` — e o
shell reencaminha esse prefixo para ela. Sem isso, três zonas disputam `/_next` e a última
a subir ganha.

O prefixo é parte do contrato público da zona: mudá-lo invalida HTML já servido que aponta
para o prefixo antigo.

### 1.3 Política de cache

| Recurso | Cabeçalho | Por quê |
|---|---|---|
| Asset com hash no nome | `public, max-age=31536000, immutable` | o nome muda quando o conteúdo muda |
| HTML de rota autenticada | `private, no-store` | carrega projeção por usuário |
| Resposta de `/{zona}/api/bff/*` | `private, no-store` | idem |
| Fragmento entre zonas | `private, no-store` | carrega bloco sob ACL |

`no-store` no HTML não é conservadorismo: o payload já vem projetado por ator, e um
intermediário que o guardasse serviria o pedido da `marina` para o `gabrigas`.

---

## 2. Ambientes e descoberta de zonas

### 2.1 O mapa de zonas é configuração de primeira classe

Zona não se descobre — se declara. O mesmo mapa alimenta três coisas, e elas precisam
concordar ou o sistema falha de formas difíceis de ler:

```
mapa de zonas ──┬─→ rewrites do shell        (para onde o navegador é levado)
                ├─→ allowlist de fragmento   (quem pode ser chamado no servidor)
                └─→ navegação do shell       (o que aparece no menu)
```

| Ambiente | Como as zonas se endereçam |
|---|---|
| desenvolvimento | `http://localhost:3001`, `:3002`, `:3003` |
| produção | DNS interno, não roteável da internet |

**A zona nunca é alcançável diretamente pelo navegador em produção.** Ela existe atrás do
shell. Isso não é detalhe de infraestrutura: é o que faz a camada 1 do `proxy.ts` ter
sentido, e é o mesmo motivo pelo qual o domínio não é exposto.

### 2.2 O que não pode vir do ambiente

`API_BASE_URL`, o mapa de zonas e o emissor OIDC vêm de variável de ambiente. **Nada disso
pode vir de cabeçalho de requisição** — nem `Host`, nem `X-Forwarded-*`. Um destino
derivado de cabeçalho é o mesmo furo que a allowlist do elemento 7 existe para fechar, com
outra roupa.

---

## 3. Sessão, ponta a ponta

### 3.1 Entrada

```
/login (shell) → provedor OIDC → /api/auth/callback (shell)
  → grava { sub, roles, accessToken, expiraEm } no store compartilhado
  → devolve cookie __Host-session = id opaco
```

O cookie carrega **um identificador opaco**, nunca o token. `__Host-` exige `Secure`,
`Path=/` e nenhum `Domain`, o que o torna de domínio inteiro — e é por isso que ele
atravessa zonas sem esforço.

### 3.2 Por que `roles` fica e grupos não

`roles` monta menu, que é decisão do cliente sobre si mesmo. **Grupos são insumo de
autorização, e autorização é do domínio** — se o BFF guardasse grupos, a tentação de
decidir com eles apareceria, e a regra passaria a existir em dois lugares.

É o que separa `rafael` de `marina` no caso: ambos passam pela mesma sessão, e só o
domínio sabe que `ADMIN` não concede `COMERCIAL-NORDESTE`.

### 3.3 Saída — e por que ela é mais difícil que a entrada

Encerrar sessão precisa valer nas três zonas **imediatamente**. Com o token no navegador
isso seria impossível; aqui é fácil, e a razão é arquitetural:

> O store compartilhado é o único lugar onde a sessão existe. Apagar a entrada encerra a
> sessão em todas as zonas de uma vez, porque nenhuma delas guarda estado de sessão
> próprio.

```
/api/auth/sair (shell)
  → remove a entrada do store        ← encerra em TODAS as zonas
  → expira o cookie
  → encerra a sessão no provedor OIDC (back-channel, se suportado)
```

A ordem importa: remover do store **primeiro**. Se o cookie expirasse antes e a remoção
falhasse, restaria uma sessão órfã válida no store, alcançável por quem tivesse copiado o
cookie.

Uma zona **nunca** implementa saída. Ela redireciona para a do shell.

### 3.4 Renovação

`getAccessToken` renova quando falta menos de 30 s para expirar. Com várias zonas, três
processos podem tentar renovar a mesma sessão ao mesmo tempo.

> **Aberto.** [PENDENCIAS §4](../comum/docs/PENDENCIAS.md) — o desenho do lock depende de
> a política do IdP permitir ou não uso concorrente do mesmo `refresh_token`. Pergunta não
> feita; bloqueia produção. Ver §8.

---

## 4. Navegação

O menu do shell precisa conhecer as rotas das três zonas — e é a única peça que
legitimamente sabe de todas.

- É construído a partir do **mapa de zonas** (§2.1), não descoberto em runtime.
- É filtrado por `roles`, que é decisão de cliente sobre si mesmo.
- **Filtrar o menu não é autorização.** Esconder a entrada de Comercial para quem não tem
  o grupo é ergonomia; quem digitar a URL recebe `404` do domínio. As duas coisas precisam
  existir, e só a segunda é segurança.
- Todo link entre zonas é `<a>`, nunca `<Link>` — que falharia em silêncio (§7.2 do
  documento de arquitetura).

---

## 5. Falha

### 5.1 Hierarquia

Cada nível degrada sem levar o de cima junto:

| Falha | Efeito | Quem absorve |
|---|---|---|
| Fragmento de outra zona | o bloco não aparece | `try/catch` + timeout de 2 s no `FragmentoRemoto` |
| Uma rota da zona | página de erro da zona | error boundary da rota |
| Zona inteira fora | shell serve `/erro-de-zona` | rewrite falha, shell trata |
| Store de sessão fora | ninguém autentica | **sem degradação** — é núcleo |
| Shell fora | nada funciona | aceito: é o gateway |

As duas últimas linhas são deliberadas. Store de sessão e shell são pontos únicos de
falha, e fingir o contrário produziria um desenho pior — com sessão replicada por zona,
que é a coisa que o §3.3 mostra ser perigosa.

### 5.2 Health check é seu

Multi-Zones não tem primitiva de saúde entre zonas. Cada zona expõe
`/{zona}/api/health`, que responde sem tocar o domínio — ele verifica que o **processo**
está de pé, não que o domínio está.

Health check que consulta o domínio transforma indisponibilidade do domínio em
indisponibilidade da zona, e faz o orquestrador reiniciar processos saudáveis.

---

## 6. Testes da arquitetura

Os testes de invariante ([`11-testes.md`](../comum/docs/11-testes.md)) rodam **por zona**.
O que só a arquitetura MFE exige:

| Teste | O que pega |
|---|---|
| Contrato do fragmento | a zona dona mudou o HTML do fragmento e quebrou a consumidora |
| Travessia entre zonas | `<Link>` apontando para fora do prefixo; `Location` vazando a origem da zona |
| Reconexão do `SharedWorker` | porta morta derrubando o SSE das vivas |
| Projeção por ator, nas três zonas | a mesma rota devolvendo bloco sensível a quem não tem o grupo |
| Duplicação de bundle | bytes rebaixados numa travessia — insumo da decisão §8.1 |

> **Uma zona só não testa Multi-Zones.** Hard navigation, portas do `SharedWorker`, `<Link>`
> silencioso, duplicação de bundle, exceções de rewrite e ACL de fragmento **só se tornam
> observáveis com duas**. Até a segunda zona existir, o que está rodando é um monólito com
> passos a mais.

Isso é um argumento concreto para antecipar a segunda zona — ver §8.4.

---

## 7. Deploy

### 7.1 Ordem

```
@erp/contratos → @erp/nucleo → @erp/ui → zonas → shell
```

Contratos e núcleo antes de qualquer consumidor. O shell por último, porque é ele que
passa a rotear para uma zona nova — subir a rota antes da zona serve `/erro-de-zona`.

### 7.2 O gate que substitui o deploy atômico

Multi-repo descartou o deploy atômico. O substituto é o **lockstep do núcleo**: um PR que
atualiza `@erp/nucleo` numa zona e não nas outras falha no CI. Dois contratos de erro ou
duas allowlists no mesmo produto é falha de segurança, não inconsistência estética.

### 7.3 Rollback

Zonas revertem **independentemente**, e é a vantagem que paga o preço do multi-repo.

Duas restrições:

- **Reverter uma zona não pode reverter o núcleo abaixo do lockstep.** Se a versão
  anterior da zona dependia de um núcleo mais antigo, o gate impede a volta — e está
  certo. A saída é avançar corrigindo, não voltar.
- **Contrato só cresce.** Como as zonas sobem em momentos diferentes, remover um campo de
  `@erp/contratos` quebra quem ainda não atualizou. A janela de depreciação de duas minors
  existe para isso, e a consequência prática é: adicione agora, remova duas minors depois.

### 7.4 Assimetria entre deploys

Se a zona Comercial publicar uma ação nova antes de a Pedidos atualizar `@erp/contratos`,
a ação não aparece na interface da Pedidos até o deploy dela. **Isso é aceitável e precisa
ser decisão consciente** — documentada no contrato de versão, não descoberta em produção.

---

## 8. O que continua aberto

### 8.1 Module Federation restrito à `@erp/ui`
Limitação 3, a única que a arquitetura não resolve. Critério que decide: medir os bytes
rebaixados numa travessia Pedidos → Estoque → Comercial, cache quente e frio. Adiado até
haver medição — §6 diz quem a produz.

### 8.2 Lock de renovação × política do IdP
[PENDENCIAS §4](../comum/docs/PENDENCIAS.md). Bloqueia produção. §3.4.

### 8.3 Limite de taxa e admission control
[PENDENCIAS §7](../comum/docs/PENDENCIAS.md). O modelo de ameaça marca enumeração por
identificador sequencial como *não impedida* sem limite de taxa, e distinção por tempo de
resposta como **não mitigada**. O shell é o lugar natural; não há desenho.

### 8.4 Antecipar a segunda zona
O roteiro atual põe a segunda zona na rodada 3. O §6 argumenta que **nada de Multi-Zones é
testável antes dela**, o que sugere antecipá-la — ainda que trivial — para expor os
problemas de travessia enquanto são baratos.

**Recomendação:** antecipar. **Não decidido** — muda o roteiro de
[`00-arquitetura.md`](00-arquitetura.md) §13 e é chamada do humano.

### 8.5 Correlação de trace entre zonas
Hard navigation destrói o contexto de trace; uma jornada por duas zonas são dois traces.
Correlacioná-los exige identificador de jornada no cookie, sem PII. Não desenhado.
