# ADR-0006 — CSP: nonce na zona autenticada, hash na zona pública

**Status:** aceita · **Data:** 2026-08

## Contexto

A especificação exige CSP com nonce por requisição, sem `unsafe-inline`.
A zona pública (`/`, `/sobre`, `/contato`, `/guia-de-uso`) é estática e servida de CDN.

## O conflito

**CSP com nonce e prerender estático são mutuamente exclusivos.** O nonce vem do
`proxy.ts` a cada requisição; uma página estática tem HTML fixo. Reaproveitar nonce
em resposta cacheada é equivalente a `unsafe-inline` com passos extras.

A documentação do Next é explícita: o nonce é aplicado durante a renderização no
servidor, com base no cabeçalho CSP presente na requisição. Páginas estáticas são
geradas no build, quando nenhum cabeçalho existe.

Forçar nonce em tudo desabilita otimização estática e ISR, torna PPR incompatível,
e impede cache de CDN.

## Custo medido

| | Estática no CDN | Dinâmica com nonce |
|---|---|---|
| RTT até o servidor | ~5 ms (PoP local) | ~30 ms (origem) |
| Tempo de servidor | 0 | ~20 ms |
| **TTFB** | **~7 ms** | **~50 ms** |

Fator ~7×, mais a perda das conexões persistentes do edge (2–3 round trips de handshake).

## Alternativas

| Opção | Preserva estático | Sem `unsafe-inline` | Complexidade |
|---|---|---|---|
| **Hash em build para a zona pública** | sim | sim | média (passo de build) |
| Injeção de nonce no edge da CDN | sim | sim | alta (Worker + HTMLRewriter) |
| `unsafe-inline` na zona pública | sim | **não** | nenhuma |
| Tudo dinâmico com nonce | **não** | sim | nenhuma |

## Decisão

- **Zona `(app)`:** nonce por requisição, via `proxy.ts`.
- **Zona `(publico)`:** CSP baseada em hash, gerada no build.

A zona pública não tem sessão, dado autenticado nem chamada ao domínio. Ainda assim,
optamos por hash em vez de `unsafe-inline` para não deixar concessão sem justificativa.

## Implementação da zona pública

```js
// scripts/gerar-hashes-csp.mjs — roda após next build
import { createHash } from 'node:crypto'
const hashes = new Set()
for (const arquivo of htmlEstaticos('.next/server/app')) {
  const html = readFileSync(arquivo, 'utf8')
  for (const [, conteudo] of html.matchAll(/<script(?![^>]*\ssrc)[^>]*>([\s\S]*?)<\/script>/g)) {
    hashes.add(`'sha256-${createHash('sha256').update(conteudo).digest('base64')}'`)
  }
}
// grava JSON lido por next.config.ts
```

## Consequências

- passo adicional no pipeline de build, que precisa rodar **antes** do deploy
- mudança em script inline exige regenerar hashes; ocorre raramente em conteúdo estático
- se o pipeline não permitir esse passo, o fallback é `unsafe-inline` na zona pública,
  registrado como exceção aprovada — não como omissão

## Processo obrigatório de implantação

Suba primeiro em modo relatório e colete violações por duas semanas:

```
Content-Security-Policy-Report-Only: ...; report-uri /api/csp-report
```

Toda CSP estrita quebra algo que ninguém previu.
