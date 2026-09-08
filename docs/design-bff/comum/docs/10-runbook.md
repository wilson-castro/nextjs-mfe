---
doc: 10-runbook
publico: [humano, agente]
---

# 10 — Runbook

## 1. SSE não entrega eventos, mas a conexão está aberta

**Causa mais provável:** buffering em proxy reverso.

O nginx acumula a resposta antes de repassar. O cabeçalho `X-Accel-Buffering: no` resolve,
mas ingress controllers variam.

**Diagnóstico**

```bash
curl -N -H "Cookie: __Host-session=…" https://app/api/stream
# se os eventos chegam em lote a cada N segundos → buffering
# se chegam um a um → o problema é outro
```

Teste direto contra o pod, sem passar pelo ingress. Se funcionar ali e não pelo ingress,
é buffering.

**Correção por camada**

| Camada | Ajuste |
|---|---|
| nginx | `proxy_buffering off` no location |
| nginx ingress | anotação `nginx.ingress.kubernetes.io/proxy-buffering: "off"` |
| ALB / ELB | verificar timeout de idle > 60 s |
| Cloudflare | desabilitar minificação e proxy na rota `/api/stream` |

## 2. Conexão SSE cai a cada hora

**Esperado.** O access token expira e o loop de reconexão relê. Se estiver caindo
com mais frequência:

- verifique se `maxDuration` do handler está definido
- verifique idle timeout do load balancer contra o intervalo de heartbeat (20 s)

Se o heartbeat não estiver chegando, alguma camada está descartando comentários SSE (`: `).

## 3. Rajada de renderização após reinício do BFF

**Sintoma:** CPU do BFF satura logo após deploy.

**Causa:** todas as abas reconectam simultaneamente e cada uma dispara revalidação.

**Mitigações, em ordem:**

1. Jitter na reconexão (1 a 5 s aleatórios)
2. Debounce de 150 ms no `AssinaturaPedido` — já implementado
3. Deploy com rolling update, não recreate
4. Coalescing por id no relay, se um evento de domínio afeta muitos registros

## 4. `409` intermitente que ninguém reproduz

**Causa quase certa:** o mesmo dado sendo buscado por RSC **e** por React Query,
gerando dois valores de `versao` em memória. O `If-Match` usa o errado.

Ver [ADR-0005](adr/0005-tanstack-query-com-escopo-limitado.md). A regra existe por isso.

**Diagnóstico:** procure o recurso em questão sendo lido por uma DAL e por um
`useQuery` na mesma tela.

## 5. Usuário deslogado sem motivo

**Causa provável:** Redis de sessão com `maxmemory-policy: allkeys-lru` em vez de
`noeviction`. Desde o [ADR-0007](adr/0007-remover-cache-de-payload.md) não há cache
disputando memória, mas a política errada continua capaz de expulsar sessões sob pressão.

```bash
redis-cli -u $REDIS_SESSIONS_URL CONFIG GET maxmemory-policy
# deve retornar: noeviction
```

Ver [ADR-0002](adr/0002-redis-como-store-de-sessao.md).

## 5.1 Domínio saturado sob carga de leitura

**Sintoma:** p99 do domínio cresce; o BFF fica esperando.

**Contexto:** desde o ADR-0007 o BFF não absorve leitura. Com 2.000 usuários, o modelo
projeta ~267 chamadas/s ao domínio.

**A resposta NÃO é ressuscitar o cache no BFF.** Ele foi removido por corretude, não por
desempenho. As saídas, em ordem:

1. cachear **no domínio**, onde a chave é natural e a projeção é conhecida
2. reduzir blocos por página, ou carregá-los sob demanda
3. paginar itens e lotes no domínio
4. escalar réplicas do domínio

## 6. Aplicação quebra em produção mas funciona em `dev`

**Suspeite de CSP.** Em `next dev` a política é mais permissiva. Se a hidratação não
acontece e o console mostra bloqueio de script, verifique se o `proxy.ts` está setando
`content-security-policy` nos cabeçalhos **da requisição** — não só na resposta.

O Next lê o nonce do cabeçalho da requisição para anexá-lo aos scripts do framework.
Ver [CORRECOES.md](CORRECOES.md).

## 7. Latência subiu sem mudança de código

Verifique nesta ordem:

1. `RTT_lan` entre BFF e domínio — se passou de 5 ms, algo mudou na topologia
2. **p99 do domínio por endpoint** — sem cache no BFF, toda leitura chega lá
3. Utilização do pool de conexões do domínio
4. Duração do span de render, se o payload cresceu

> Desde o [ADR-0007](adr/0007-remover-cache-de-payload.md) o BFF não cacheia payload.
> Latência de leitura é, por construção, latência do domínio.

## 8. Investigar um erro relatado pelo usuário

O usuário fornece o `supportId`.

```bash
# 1. localizar no log
grep "supportId=0K3F9" /var/log/app/*.log

# 2. extrair o trace_id da mesma linha
# 3. abrir no backend de traces
```

O `trace_id` nunca aparece na resposta HTTP. Isso é deliberado — ver [04](06-seguranca.md) §8.

## 9. Página pública ficou lenta

Provavelmente deixou de ser estática. O `force-static` deveria ter falhado o build —
verifique se ele ainda está no arquivo.

```bash
npm run build 2>&1 | grep -A2 "○\|●\|ƒ"
# ○ = estática   ● = SSG com params   ƒ = dinâmica
```

Rota pública marcada `ƒ` é regressão.
