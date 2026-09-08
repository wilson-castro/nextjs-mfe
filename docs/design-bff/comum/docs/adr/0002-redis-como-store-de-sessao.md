# ADR-0002 — Redis como store de sessão, em instância separada do cache

**Status:** aceita · **Data:** 2026-08

## Contexto

O ADR-0001 exige sessão no servidor. Com N réplicas atrás de um load balancer, a
requisição do usuário pode cair em qualquer uma — memória local não serve.

Havia também a opção de cookie cifrado (JWE), que dispensaria store.

## Alternativas

| Opção | Prós | Contras |
|---|---|---|
| **Redis / Valkey** | TTL nativo, lock atômico, pub/sub para fan-out | mais um serviço |
| PostgreSQL | você já tem | 5–20 ms por lookup vs 0,3 ms; limpeza de expirados |
| Memcached | simples, bom LRU | sem persistência, sem estruturas, sem pub/sub |
| DynamoDB / Firestore | gerenciado, TTL nativo | latência maior, custo por operação |
| **Cookie JWE** | zero infraestrutura | token trafega; limite de 4 KB; revogação impossível |

O cookie JWE foi o mais tentador. Descartado por dois motivos: o material de credencial
ainda **trafega** até o navegador, ainda que ilegível; e a impossibilidade de revogação
quebra o cenário de perda de acesso durante a sessão.

> **Atualização (ADR-0007).** Com a remoção do cache de payload, resta apenas o Redis de
> sessão. A análise abaixo sobre `maxmemory-policy` conflitante permanece correta e
> instrutiva, mas **a segunda instância deixou de ser necessária**. Configure uma única
> instância com `noeviction` e persistência AOF.

## Decisão

Redis, com `strategy: 'database'` no Auth.js. O navegador carrega apenas um identificador
opaco. **Duas instâncias separadas** para sessão e cache.

## Por que duas instâncias, e não dois bancos lógicos

`maxmemory-policy` é configuração **por instância**, não por database. `SELECT 1` /
`SELECT 2` não resolve. E os dois usos querem políticas opostas:

| | Sessões | Cache |
|---|---|---|
| Política | `noeviction` | `allkeys-lru` |
| Persistência | AOF | nenhuma |
| Se lotar | erro de escrita (aceitável) | descarta o menos usado (desejável) |
| Perder um dado significa | usuário deslogado | uma ida a mais ao domínio |

Com `allkeys-lru` numa instância única, **um pico de cache desloga seus usuários**.
Com `noeviction`, o cache lotando derruba as escritas de sessão.

## Consequências

- duas databases em Redis gerenciado; custo baixo, mas não nulo
- o BFF depende de dois serviços externos além do domínio e do IdP
- se o orçamento não permitir, o compromisso aceitável é instância única com
  `noeviction` e TTLs agressivos no cache, com alarme de memória em 70%

## Nota de implementação: lock de renovação

O refresh de token usa `SET chave valor NX EX 15`:

- **NX** — *if Not eXists*: a escrita só acontece se a chave ainda não existir.
  É o que garante que apenas um requisitante entre na renovação.
- **EX 15** — expiração em 15 segundos. Sem isso, um processo que morresse antes de
  liberar o lock travaria a renovação para sempre.

Este é o padrão simples de lock do Redis. Ele **não é seguro sob failover** — em cenários
que exigem exclusão mútua rigorosa, seria preciso Redlock ou uma abordagem com fencing
token. Para renovação de token, o pior caso de falha é uma renovação duplicada, o que é
inofensivo **sob a premissa de que o IdP não faz rotação com detecção de reuso**.

> ⚠️ **Premissa não verificada.** A RFC 9700 descreve que, com rotação, o refresh token
> anterior é invalidado; apresentar um token já usado pode ser interpretado como replay e
> resultar na revogação da família inteira. Nesse regime, **renovação duplicada deixa de ser
> inofensiva e passa a derrubar a sessão**.
>
> Isso conflita diretamente com a melhoria "rotação de refresh token com detecção de reuso"
> listada em [04 §11](../06-seguranca.md).
>
> Antes de habilitar rotação, é preciso responder ao IdP: *emite `refresh_token`? há
> rotação? há detecção de reuso? qual a política para refresh concorrente?* Se não houver
> `refresh_token` — possível em alguns IdPs federados — todo este lock é desnecessário.
>
> Ver [PENDENCIAS](../PENDENCIAS.md) §4.
