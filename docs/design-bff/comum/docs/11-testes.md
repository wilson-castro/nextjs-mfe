---
doc: 11-testes
publico: [humano, agente]
---

# 11 — Testes e critérios de aceite

## 1. Invariantes com teste automatizado

Cada invariante de `AGENTS.md` tem verificação. Se não tiver, ela não é invariante — é intenção.

| # | Invariante | Verificação |
|---|---|---|
| 1 | Token não vai ao navegador | `test:vazamento` — grep no HTML e no flight payload |
| 2 | DTO sensível não vira prop de ilha | lint customizado + `test:vazamento` |
| 3 | `server-only` presente | falha de build automática |
| 4 | ~~Escopo na chave de cache~~ | **removido** — não há cache de payload (ADR-0007) |
| 5 | Sem `"use cache"` com dado de usuário | análise estática (seção 3) |
| 6 | Server Action revalida sessão | lint customizado |
| 7 | `401`/`403`/`404` conforme o critério de [04 §2](06-seguranca.md) | teste de integração por ator e por código |
| 8 | Sem placeholder de "sem acesso" | teste de vazamento (seção 2) |
| 9 | `_permissoes` não usado como autorização | revisão + teste de permissões (seção 6) |
| 10 | Domínio inalcançável da internet; BFF sem endpoint sem sessão | varredura de rede + teste de rota |
| 11 | Sem `NEXT_PUBLIC_` sensível | verificação no CI |
| 12 | Erro normalizado `{ codigo, supportId }` | fuzzing (critério 5) |
| — | **Allowlist outbound** ([04 §6.2](06-seguranca.md)) | seção 3.1 |

## 2. Teste de vazamento

```ts
// e2e/vazamento.spec.ts
const PROIBIDOS = ['precoNegociado', 'margem', 'contratoNumero']

for (const usuario of ['usuario_sem_grupo_comercial', 'admin_sem_grupo_comercial']) {
  const res = await fetch('/pedidos/8821', { headers: cookieDe(usuario) })
  const html = await res.text()

  for (const termo of PROIBIDOS) {
    expect(html, `${usuario} não deve ver ${termo}`).not.toContain(termo)
  }
  // o flight payload vive em self.__next_f.push([...])
  const flight = html.match(/self\.__next_f\.push\((.*?)\)/gs)?.join('') ?? ''
  for (const termo of PROIBIDOS) expect(flight).not.toContain(termo)
}
```

O caso do administrador sem grupo comercial é o mais importante: ele testa a separação
entre role e grupo. Se passar por role, o teste pega.

## 3. Análise estática: `"use cache"` seguro

```ts
// scripts/verificar-cache.ts
// nenhuma função marcada "use cache" pode alcançar getAccessToken ou requireSessao,
// direta ou transitivamente
```

Implementável com `ts-morph` percorrendo o grafo de chamadas. Roda no CI.

## 3.1 Teste de allowlist outbound

Exigência da RFC 10017. Nenhuma requisição do BFF pode sair para origem diferente de
`API_BASE_URL`, sob qualquer entrada do cliente.

```ts
const HOSTIS = [
  '../../evil', '//evil.com', 'http://evil.com', '%2F%2Fevil.com',
  '..%2F..%2Fadmin', 'http:/\/\evil.com', '\evil.com',
]

for (const id of HOSTIS) {
  const saidas = await interceptarSaidasDoBff(() =>
    fetch(`/pedidos/${encodeURIComponent(id)}`, { headers: cookieValido }))

  for (const url of saidas) {
    expect(new URL(url).origin).toBe(new URL(process.env.API_BASE_URL!).origin)
  }
}
```

## 3.2 Testes P0 de correção — antes de qualquer benchmark

Estes quatro testam **correção e confidencialidade**, não desempenho. Nenhum deles passa
hoje, porque as decisões correspondentes estão abertas em [PENDENCIAS.md](PENDENCIAS.md).

| # | Hipótese sob teste | Experimento | Falsifica se |
|---|---|---|---|
| ~~P0-a~~ | ~~`scopeKey` representa a projeção~~ | **eliminado pelo ADR-0007** | — |
| ~~P0-b~~ | ~~O cache nunca regrava versão antiga~~ | **eliminado pelo ADR-0007** | — |
| P0-c | A recuperação do SSE é correta | derrubar todos os BFFs, alterar dado no domínio, retornar | DOM diferente do domínio após reconexão |
| P0-d | O lock de refresh é seguro | failover do Redis durante refresh concorrente | revogação indevida de família de tokens |

O P0-c é o mais revelador: ele testa exatamente a cadeia
`evento perdido → cache stale → refresh que lê o cache`.

## 4. Critérios de aceite

| # | Critério | Como testar |
|---|---|---|
| 1 | Nenhum campo sensível no payload de quem não tem o grupo | seção 2 |
| 2 | Evento externo visível em ≤ 2 s sem recarregar | duas sessões no Playwright; publica evento; mede até repintura |
| 3 | Alteração de usuário propaga em ≤ 2 s, incluindo listagem | idem, medindo `performance.now()` |
| 4 | Usuário de outro grupo não recebe frame SSE do recurso | intercepta `EventSource` e assere zero mensagens com o id |
| 5 | Nenhum erro com framework, stacktrace ou exceção | fuzzing; busca por `org.springframework`, `at java.`, `SELECT`, `X-Powered-By` |
| 6 | Trace contínuo do navegador ao domínio, sem dado pessoal | consulta por `trace_id`; valida chaves contra a allowlist |
| 7 | Após reconexão, telas montadas consistentes | derruba o pod do BFF com telas abertas; compara DOM com o banco |

## 5. Teste do critério 4 — o mais fácil de errar

```ts
const frames: string[] = []
await page.route('**/api/stream', async (route) => {
  const res = await route.fetch()
  const body = await res.text()
  frames.push(body)
  route.fulfill({ response: res, body })
})

// ... provoca alteração no recurso 8821 pela sessão de outro grupo ...
await page.waitForTimeout(5000)

expect(frames.join('')).not.toContain('"id":"8821"')
```

Assere **ausência**, não filtragem. Se o frame chegou e o cliente ignorou, o teste deve falhar.

## 6. Teste de permissões

```ts
// garante que ninguém adicionou ação sem proteção
for (const acao of ACOES_PEDIDO) {
  render(<Acoes pedidoId="1" permissoes={todasFalsas} />)
  expect(screen.queryByRole('link', { name: rotulo(acao) })).toBeNull()
}
```

## 7. Verificação de renderização estática

```bash
npm run build 2>&1 | tee build.log
# rota pública marcada como ƒ (dinâmica) é regressão
grep -E "^ƒ +/(sobre|contato|guia-de-uso)?$" build.log && exit 1
```

## 8. O que não é coberto por teste

Honestidade sobre os limites:

- **Disciplina de props.** O lint pega os casos óbvios; um DTO renomeado passa.
  Revisão de código continua necessária em blocos sensíveis.
- **Peering de rede.** Só medível em produção, com `mtr` dos escritórios reais.
- **Comportamento de proxy sob carga.** Buffering de SSE só aparece com tráfego real.
- **CSP.** Toda política estrita quebra algo imprevisto. Modo relatório por duas semanas
  antes de bloquear.
