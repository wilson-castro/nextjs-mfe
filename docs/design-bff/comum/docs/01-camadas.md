---
doc: 01-camadas
publico: [humano, agente]
pre_requisito: AGENTS.md
---

# 01 — Camadas

Este documento descreve **fronteiras**: o que executa onde, o que pode atravessar,
e o que cada camada tem autoridade para decidir. Não descreve arquivos — isso é o [02](04-servicos.md).

## 1. As três camadas

```
┌─────────────────────────────────────────────┐
│ CLIENTE — executa no navegador              │
│ interatividade, estado de tela, otimismo    │
└────────────────────┬────────────────────────┘
                     │ cookie opaco
┌────────────────────┴────────────────────────┐
│ BFF — executa no servidor Node              │
│ credencial, composição, cache, stream       │
└────────────────────┬────────────────────────┘
                     │ Bearer + traceparent
┌────────────────────┴────────────────────────┐
│ DOMÍNIO — executa na JVM                    │
│ regra, autorização, projeção, emissão       │
└─────────────────────────────────────────────┘
```

Cada seta é uma **fronteira de confiança**. O que vem de baixo é confiável;
o que vem de cima é hostil até prova em contrário.

## 2. Autoridade por camada

A pergunta que resolve 90% das dúvidas de implementação: *quem tem autoridade para decidir isto?*

| Decisão | Autoridade | As outras camadas |
|---|---|---|
| Quais registros existem para você | Domínio | propagam o `404` |
| Quais campos entram no payload | Domínio | não mascaram, não filtram |
| Se você pode executar uma ação | Domínio | exibem ou escondem o botão |
| Estado derivado de negócio | Domínio | renderizam o que veio |
| Onde a credencial vive | BFF | cliente não sabe que existe |
| Qual chave de cache invalidar | BFF | cliente não pede invalidação |
| Se a tela montada precisa recarregar | Cliente | ninguém decide por ele |
| Estado visual (aba aberta, filtro digitado) | Cliente | não trafega |

Duas leituras importantes dessa tabela:

- O **BFF não é camada de autorização.** Ele guarda credencial e compõe. Se começar a
  decidir acesso, a regra passa a existir em dois lugares e um deles vai divergir.
- O **cliente decide apenas sobre si mesmo.** Ele nunca decide o que pode ver.

## 3. Por que a camada do meio existe

Sem ela, a credencial precisaria morar no navegador. O IETF, na **RFC 10017 / BCP 212**
(*OAuth 2.0 for Browser-Based Applications*, agosto de 2026), classifica o BFF como o mais
seguro dos três padrões analisados e o recomenda para aplicações empresariais e sensíveis: código injetado no navegador alcança o que
o seu código alcança, e nenhum mecanismo do lado do cliente muda esse fato.

**O que o BFF garante:** o token não é exposto ao código executado no navegador. Um atacante não leva a credencial para a máquina dele e não continua agindo depois que o usuário fecha a aba.

> Ressalvas: JavaScript malicioso no navegador não consegue ler diretamente o token que nunca é entregue ao navegador. Mas isso não implica impossibilidade universal de exfiltração: SSRF no BFF, comprometimento do processo Node, logging incorreto, dependência comprometida ou erro no proxy ainda podem vazar o token.

**O que o BFF não garante:** imunidade a XSS. Código injetado ainda age como o usuário
através do cookie, enquanto a sessão durar. É redução de janela e alcance, não imunidade.

## 4. Preocupações transversais

Três coisas não pertencem a uma camada só. Elas atravessam, e o desenho precisa mostrar isso.

| Transversal | Atravessa | Consequência prática |
|---|---|---|
| **Autorização** | todos os serviços do BFF, horizontalmente | inclusive o de tempo real, reavaliada a cada emissão de evento — não só na conexão |
| **Isolamento de servidor** | todos os serviços do BFF, horizontalmente | `server-only` é fronteira de compilação: erro de build, não erro de runtime |
| **Observabilidade** | cliente **e** BFF, verticalmente | é a única que cruza a fronteira do navegador, porque o trace precisa ser contínuo |

Repare que **autorização não atravessa o cliente**. Isso é deliberado e é a decisão
mais importante do desenho. Ver [06 — Segurança](06-seguranca.md).

## 5. O que atravessa cada fronteira

### Navegador → BFF

| Trafega | Nunca trafega |
|---|---|
| cookie opaco de sessão | token de qualquer tipo |
| identificadores de recurso | lista de grupos, claims |
| dados de formulário | claims do JWT |
| `traceparent` de mesma origem | atributos com dado pessoal |

### BFF → Domínio

| Trafega | Nunca trafega |
|---|---|
| `Authorization: Bearer` | decisão de acesso tomada pelo BFF |
| `If-Match` / `If-None-Match` | filtro de campos feito pelo BFF |
| `traceparent` | — |

### Domínio → BFF → Navegador

O payload já vem projetado por perfil de acesso. O BFF **não filtra e não mascara** —
se ele precisasse filtrar, o campo teria existido em memória no processo errado.

## 6. O cliente não é uma SPA

Rótulo comum e impreciso. Uma SPA renderiza tudo no navegador e busca dados por XHR.
Aqui, a renderização é no servidor e o navegador recebe o resultado.

| | SPA clássica | Este sistema |
|---|---|---|
| Primeira renderização | navegador | servidor |
| Busca de dados | fetch do cliente | direto no servidor |
| JS enviado | tudo | só ilhas `'use client'` |
| Navegação sem recarregar | sim | sim |
| Estado preservado entre telas | sim | sim |

As duas últimas linhas são o que sobrou de SPA — e são **requisito, não conforto**:
a conexão SSE e o cache de consulta dependem de o processo JavaScript sobreviver à
troca de tela. Recarga completa derrubaria e reabriria o stream a cada clique.

**Efeito colateral conhecido:** navegar entre as zonas pública e autenticada provoca
recarga completa, porque cada uma tem seu próprio root layout. Ver [07](09-convencoes.md).

## 7. Núcleo e extensões — a segunda separação

As camadas dizem *onde* cada coisa executa. Uma classificação **ortogonal** diz *se é
obrigatória*:

> **Desligue o componente. O sistema continua correto?**
> **Sim**, só piora desempenho, frescor ou observabilidade → **extensão**.
> **Não**, alguma resposta muda → **núcleo**.

As duas classificações se cruzam:

| | Núcleo | Extensão |
|---|---|---|
| **Cliente** | nenhum — o cliente não decide nada obrigatório | otimismo, cache de consulta, telemetria |
| **BFF** | sessão, composição, mutação, erro, isolamento, allowlist, trace | relay do SSE, CSP com nonce |
| **Domínio** | autorização, projeção, regra | cache |

A célula vazia é informativa: **nenhum elemento do núcleo vive no cliente**. Se algo do
núcleo dependesse do navegador, ele seria contornável.

Detalhes em [02 — Núcleo](02-nucleo.md) e [03 — Extensões](03-extensoes.md).

## 8. Onde continuar

- Para ver os arquivos que materializam estas camadas → [02](04-servicos.md)
- Para entender por que as fronteiras são estas → [03](05-decisoes.md)
