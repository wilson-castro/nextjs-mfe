Antes de desenhar: preciso verificar uma coisa que pode invalidar a escolha.Preciso interromper o desenho, porque encontrei três fatos que invalidam a escolha da ferramenta — não o padrão.

## 1. `nextjs-mf` não suporta App Router

A issue "Next.js App router and module-federation/nextjs-mf" foi encerrada como *not planned*. A documentação oficial de setup do plugin instrui literalmente a responder "Would you like to use App Router?" > No.

O mantenedor confirmou em abril de 2025: "I also have removed the blockers for app router after talking with vercel turbo team. Technically it works. But I have blocked the feature for now."

## 2. O plugin está em fim de vida

A documentação oficial do Module Federation carrega um banner de depreciação, e o `@module-federation/nextjs-mf` está em end-of-life este ano. A recomendação de substituição é Multi-Zones baseado em roteamento para o caso comum.

## 3. Turbopack é o bundler padrão do Next 16

`nextjs-mf` é um plugin webpack. Você ficaria preso em `--webpack` numa versão que o ecossistema está deixando para trás.

---

# O custo real: um invariante quebra estruturalmente

Este é o argumento decisivo, e não é sobre ferramenta.

Pages Router serializa **props** via `getServerSideProps` — e elas vão inteiras para `__NEXT_DATA__`, no HTML. O invariante 2 diz o oposto:

> **NUNCA** passe DTO sensível como prop. O objeto inteiro é serializado, inclusive campos não renderizados.

No App Router isso é uma regra de disciplina sobre um caso específico (props de Client Component). No Pages Router **é o mecanismo padrão de toda página**. Você não tem como buscar dados no servidor sem serializar o resultado para o cliente.

Todo o resto cai junto:

| Elemento do núcleo | Depende de | Pages Router |
|---|---|---|
| 2 — Autorização só no domínio | projeção que não vaza | `__NEXT_DATA__` carrega tudo |
| 3 — Composição no servidor | RSC | não existe |
| 4 — Mutação por Server Action | Server Actions | não existem |
| 6 — Isolamento `server-only` | fronteira de compilação do RSC | vira convenção |
| Bloco sensível que "some" | `return null` no servidor | precisa vir no payload para não renderizar |

Adotar `nextjs-mf` significa **reconstruir o núcleo inteiro**, e o resultado seria estruturalmente menos seguro que o desenho atual. Não é um trade-off de conveniência.

---

# O que eu proporia

**A parte multi-repo que você descreveu funciona em qualquer das opções.** Ela é ortogonal à escolha de MF versus Multi-Zones. Segue o desenho, e depois as três saídas.

## Estrutura de repositórios

```
erp-nucleo        → @erp/nucleo      sessão · upstream · erros · trace · server-only
erp-contratos     → @erp/contratos   tipos, códigos de erro, contrato de evento
erp-ui            → @erp/ui          design system, tokens, componentes client
erp-shell         → demo-erp         gateway, sessão, SSE, navegação, telemetria raiz
erp-mfe-pedidos   → /pedidos/*       BFF próprio → domínio Pedidos
erp-mfe-estoque   → /estoque/*       BFF próprio → domínio Logística
erp-mfe-comercial → /comercial/*     BFF próprio → domínio Comercial
```

### Política de versão por pacote — e o critério que a define

Aqui o teste de núcleo/extensão volta, aplicado a dependências:

> **Se o pacote exige lockstep, é núcleo. Se tolera divergência, é extensão.**

| Pacote | Política | Por quê |
|---|---|---|
| `@erp/nucleo` | **lockstep** — todos na mesma minor | dois contratos de erro ou duas políticas de allowlist no mesmo produto é falha de segurança |
| `@erp/contratos` | semver com janela de depreciação de 2 minors | quebrar tipo derruba módulo consumidor |
| `@erp/ui` | semver tolerante — módulos podem divergir | divergência visual é feia, não perigosa |

Isso dá uma regra operacional concreta: **um PR que atualiza `@erp/nucleo` num módulo e não nos outros deve falhar no CI.**

```yaml
# .github/workflows/lockstep.yml — em cada MFE
- name: núcleo em lockstep
  run: |
    ESPERADO=$(curl -s $REGISTRY/erp-nucleo/dist-tags | jq -r .lockstep)
    ATUAL=$(jq -r '.dependencies["@erp/nucleo"]' package.json)
    [ "$ATUAL" = "$ESPERADO" ] || { echo "núcleo fora de lockstep: $ATUAL ≠ $ESPERADO"; exit 1; }
```

### O que vai em cada pacote

```
@erp/nucleo
  session/         getSessao, requireSessao, getAccessToken   'server-only'
  upstream/        cliente com allowlist outbound             'server-only'
  erros/           ErroDeAplicacao, Desatualizado, normalizar
  otel/            instrumentation, sanitizador
  permissoes/      pode()                                     ← compartilhado

@erp/contratos
  pedido.ts        PedidoDTO, ACOES_PEDIDO, PermissoesPedido
  erros.ts         MENSAGENS: codigo → texto
  eventos.ts       EventoSse, allowlist de campos

@erp/ui
  tokens/          cores, espaçamento, tipografia
  primitivos/      Button, Dialog, Table                      'use client'
  padroes/         Toolbar, FormLayout, Skeleton
```

Repare que `permissoes/` fica no núcleo **sem** `server-only` — as ilhas precisam dele. É a única exceção, e vale documentar para ninguém achar que foi esquecimento.

---

### A — Multi-Zones com fragmento no servidor *(recomendado)*

Mantém App Router, RSC, Server Actions e o núcleo inteiro. A estrutura de repositórios acima é exatamente esta. O que você perde em relação a MF: compartilhar componentes React em runtime.

O que você ganha: composição no servidor via `FragmentoRemoto`, que exercita ACL cross-módulo e isolamento de falha pelo mesmo mecanismo — coisas que MF client-side não resolve bem, porque o fragmento chegaria ao navegador antes de a autorização ser avaliada.
