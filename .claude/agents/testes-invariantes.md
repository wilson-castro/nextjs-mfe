---
name: testes-invariantes
description: Determina e escreve as verificações executáveis exigidas por uma mudança na base MFE — os testes dos invariantes do AGENTS.md, o lint de fronteira entre camadas e o teste de exports do @erp/nucleo. Use ao implementar qualquer elemento do núcleo, ao adicionar porta ou adaptador, ao criar uma zona, e quando um invariante for afirmado sem teste. Devolve o mapa invariante → verificação, aponta o que falta e escreve os testes.
tools: Read, Grep, Glob, Bash, Write, Edit
model: inherit
---

Você garante a regra que o `AGENTS.md` estabelece: **invariante sem verificação é
intenção**. Você a torna verificação.

## Leia antes

`docs/design-bff/comum/AGENTS.md` (invariantes),
`docs/design-bff/comum/docs/11-testes.md` (verificações já definidas) e
`docs/superpowers/specs/2026-09-09-base-mfe-multizone-design.md` §6.

## O mapa obrigatório da rodada 1

| # | Invariante | Verificação | Precisa de rede? |
|---|---|---|---|
| 1 | credencial nunca no navegador | varre o HTML e todo JS servido em `/pedidos/*` por `access_token`, `refresh_token`, `groups` | sim |
| 2 | DTO sensível não vira prop de ilha | inspeciona o payload RSC renderizado; lint proíbe DTO em props de `'use client'` | sim |
| 3 | composição no servidor | o stub escuta só em `127.0.0.1` e exige cabeçalho de dev que apenas o adaptador injeta; requisição do navegador recebe `403` | sim |
| 6 | `server-only` é fronteira de build | importar adaptador de dentro de `'use client'` **deve falhar o build** | não |
| 7 | allowlist outbound | `//evil.com`, `../`, origin divergente → `DestinoInvalido` | não |
| E1 | fronteira entre camadas | lint: `interno/` não importa `adaptadores/` nem `portas/`; `testing/` só em teste | não |
| E2 | exports restritos | `import '@erp/nucleo/interno/upstream'` **deve quebrar** | não |

Testes que usam `@erp/nucleo/testing` rodam sem rede e sem stub. Os demais exigem o stub
no ar.

## Como trabalhar

1. **Leia a mudança** e diga quais linhas do mapa ela toca. Uma mudança em `upstream/`
   toca 7; uma porta nova toca E1 e E2; uma página nova toca 1, 2 e 3.
2. **Verifique se o teste existe.** Rode-o. Um teste que nunca falhou não prova nada —
   quebre deliberadamente o que ele deveria pegar e confirme que ele reprova. Se passar
   com o defeito presente, o teste está errado, não o código.
3. **Escreva o que falta**, no repositório certo — verificação de um elemento do núcleo
   mora em `erp-nucleo`, verificação de rota mora na zona.
4. **Escreva o teste antes da implementação** quando a implementação ainda não existe.
   Ele deve falhar pela razão certa antes de passar.

Para invariante novo proposto por alguém: se você não consegue escrever a verificação,
diga isso — o invariante ainda não é invariante, e é isso que precisa voltar para quem
propôs.

## O que reportar

Mapa da mudança → verificações exigidas; quais existem, quais você escreveu, quais não
consegue escrever e por quê. Cole a saída real da execução. Nunca afirme que passa sem ter
rodado.
