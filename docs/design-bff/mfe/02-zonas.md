---
doc: mfe-02-zonas
data: 2026-09-09
publico: [humano, agente]
pre_requisito: 00-arquitetura.md
status: desenho completo
---

# 02 — Zonas: estrutura, contrato e propriedade

Terceira parte do desenho. [`00-arquitetura.md`](00-arquitetura.md) diz como a solução é
feita e [`01-operacao.md`](01-operacao.md) como ela roda. Este diz o que **cada time**
precisa saber para construir uma zona sem divergir das outras.

Existe porque três times em repositórios separados não compartilham revisão de código. O
que não estiver escrito aqui será decidido três vezes, de três formas.

---

## 1. Estrutura de uma zona

Derivada do mapa de [`04-servicos.md`](../comum/docs/04-servicos.md), com o que muda por
ser zona marcado.

```
AGENTS.md
next.config.ts                    ← assetPrefix: '/{zona}-static'      ← MUDA
proxy.ts                          ← export default criarProxy({...})   ← MUDA
instrumentation.ts

app/
  {zona}/                         ← TODA rota vive sob o prefixo        ← MUDA
    layout.tsx
    page.tsx
    [id]/page.tsx
    _fragmento/                   ← o que esta zona expõe a outras      ← NOVO
      {nome}/[id]/route.ts
    api/bff/                      ← NUNCA app/api/bff                   ← MUDA
    error.tsx
  _stream/
    StreamProvider.tsx            ← bootstrap próprio por zona          ← MUDA

lib/
  nucleo.ts        'server-only'  ← raiz de composição, único lugar     ← NOVO
  {dominio}/
    dal.ts         'server-only'
    tipos.ts
```

O que a zona **não** tem, porque é do shell: `app/api/auth/`, `app/api/stream/`,
`app/api/otel/`, rota pública, `lib/auth.ts`, `lib/redis.ts`.

### 1.1 `lib/nucleo.ts` é a única raiz de composição

Todo adaptador é escolhido ali e em nenhum outro lugar. Uma página que importe
`dadosHttp` direto quebra a troca de adaptador e derrota as três portas.

> **Verificável:** lint proibindo importar qualquer adaptador fora de `lib/nucleo.ts`.
> Sem essa verificação, a regra é intenção.

### 1.2 O shell não tem DAL

O shell roteia, autentica, relaia SSE e serve telemetria. **Ele não fala com nenhum
domínio.** No dia em que precisar de dado de negócio, ele pede um fragmento como qualquer
zona — senão vira uma quarta zona disfarçada de gateway, e a autoridade se espalha.

---

## 2. O contrato do fragmento

É a única API entre zonas. Precisa ser exata: as zonas sobem em momentos diferentes, e um
contrato implícito quebra no primeiro deploy assimétrico.

### 2.1 Forma

```
GET /{zona}/_fragmento/{nome}/{id}
Cookie: __Host-session=...          ← repassado, não reescrito
Accept: text/html
```

| Elemento | Regra |
|---|---|
| Método | `GET`, sempre. Fragmento é composição, nunca mutação |
| Identidade | vai no **cookie**, resolvido pela zona dona |
| `{id}` | codificado, nunca concatenado |
| Origem | só do mapa de zonas; nunca de cabeçalho da requisição |

> **A zona chamadora nunca afirma quem é o usuário.** Ela repassa o cookie e a zona dona
> resolve a sessão sozinha — mesmo caminho do navegador. Um cabeçalho `X-Usuario` faria a
> chamadora *declarar* identidade, movendo a autoridade para fora do domínio dono e
> quebrando o invariante 2 com um cabeçalho.

### 2.2 Respostas

| Status | Significa | O consumidor faz |
|---|---|---|
| `200` + `text/html` | fragmento renderizado | embute |
| `204` | **não autorizado OU nada a mostrar** | não renderiza nada |
| `5xx`, timeout | zona dona indisponível | não renderiza nada; segue |

`204` cobre os dois casos de propósito, e o consumidor **não consegue distingui-los**.
Se houvesse `403` para "não pode" e `204` para "não há", a zona Pedidos saberia que existe
uma condição comercial que o `gabrigas` não pode ver — e essa é exatamente a informação
que a ausência total existe para negar.

### 2.3 O fragmento não carrega JavaScript

Restrição não óbvia e não negociável:

> HTML de fragmento é **inerte**. Sem `<script>`, sem manipulador inline, sem `'use client'`
> atravessando a fronteira.

Duas razões, e cada uma bastaria. O nonce da CSP é gerado **por requisição e por zona** —
script vindo de outra zona traz nonce de outro contexto e é bloqueado, o que produziria um
bloco que aparece mas não funciona, em produção, de forma intermitente. E JavaScript de
outra zona reintroduziria pela porta dos fundos o problema que descartou Module Federation:
código de um módulo executando com os privilégios do documento de outro.

**Interatividade num bloco remoto é da zona consumidora.** Ela recebe o conteúdo inerte e
o embrulha na própria ilha, com o próprio nonce.

### 2.4 Estilo

O fragmento usa **apenas tokens do `@erp/ui`**, nunca classes utilitárias da zona dona.
Tokens são contrato; classe utilitária é detalhe interno, e a consumidora não a carrega no
bundle — o bloco chegaria sem estilo.

### 2.5 Versão

O consumidor envia `Accept-Fragmento-Versao: 1`. A zona dona serve a versão pedida ou
responde `204`.

Isso transforma incompatibilidade em **bloco ausente**, que já é um estado que o desenho
trata, em vez de bloco quebrado, que não é. Trocar a versão é mudança de contrato: publica
a nova, serve as duas por duas minors, depois remove a velha.

---

## 3. Quem pode mudar o quê

Repositórios separados sem revisão cruzada exigem que a propriedade seja explícita.

| Artefato | Dono | Como outro time muda |
|---|---|---|
| `@erp/nucleo` | plataforma | PR ao repo do núcleo; lockstep obriga todos a acompanhar |
| `@erp/contratos` | plataforma | PR; **acrescentar é seguro, remover exige 2 minors** |
| `@erp/ui` | design system | PR; semver tolerante |
| Rotas de uma zona | time da zona | não muda; é público |
| Contrato de fragmento | time da zona **dona** | versionado (§2.5) |
| Códigos de erro | plataforma | são globais: dois times não podem definir o mesmo código com sentidos diferentes |

A assimetria é deliberada: **acrescentar é local, remover é global.** Um campo novo em
`@erp/contratos` não quebra ninguém; um campo removido quebra quem ainda não atualizou, e
como as zonas sobem em momentos diferentes, sempre há alguém que não atualizou.

---

## 4. Criar uma zona nova

Checklist para um time novo. A ordem importa: cada passo depende do anterior.

1. **Registrar a zona no mapa** (§2.1 de `01-operacao.md`). Sem isso, ela não é roteável,
   não é chamável como fragmento e não aparece na navegação.
2. **Repositório** com `pnpm-workspace.yaml` próprio (`packages: []`), `.npmrc` apontando
   o escopo `@erp` ao registry, e `exactOptionalPropertyTypes: true` no `tsconfig` — sem
   essa flag a ausência do bloco sensível deixa de ser garantida no código desta zona.
3. **`lib/nucleo.ts`**, a raiz de composição, e `proxy.ts` de uma linha via `criarProxy`.
4. **`assetPrefix: '/{zona}-static'`** e as três regras de rewrite no shell: raiz da zona,
   sub-rotas, e assets.
5. **A suíte de invariantes**, rodando contra esta zona. Invariante afirmado sem
   verificação é intenção, e a zona nova não herda as verificações das outras.
6. **Gate de lockstep** no CI, comparando `@erp/nucleo` com o dist-tag.
7. **Health check** em `/{zona}/api/health`, sem tocar o domínio.

Uma zona só entra na navegação depois do passo 5. Antes disso ela existe, roteia e não é
oferecida a ninguém.

---

## 5. Entrega de assets

| Recurso | Onde | Por quê |
|---|---|---|
| `/{zona}-static/*` com hash | CDN, `immutable` | o nome muda quando o conteúdo muda |
| HTML de rota autenticada | **nunca CDN** | carrega projeção por ator |
| Fragmento | **nunca CDN** | carrega bloco sob ACL |

O CDN reduz a travessia física que o modelo de
[`08-desempenho.md`](../comum/docs/08-desempenho.md) descreve como irredutível — para
asset. Para HTML autenticado não há CDN possível, e é por isso que a co-localização entre
BFF e domínio é a premissa que sustenta o desempenho: ali o ganho vem de `RTT_lan ≈ 1 ms`,
não de cache de borda.

> A duplicação de bundle entre zonas (limitação 3) **não é resolvida por CDN**. O CDN
> torna o segundo download rápido; ele continua sendo um segundo download, e em conexão
> móvel o custo é de bytes e de bateria, não só de latência. Ver
> [`01-operacao.md`](01-operacao.md) §8.1.
