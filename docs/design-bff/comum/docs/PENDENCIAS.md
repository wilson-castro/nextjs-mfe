---
doc: PENDENCIAS
publico: [humano, agente]
status: BLOQUEIA PRODUÇÃO
origem: auditoria externa independente, três revisores
---

# Pendências — bloqueiam entrada em produção

Este documento tem **precedência sobre qualquer outro** enquanto houver item aberto.
Se um documento ou ADR descreve como resolvido algo listado aqui, o documento está errado.

**Status atual: 5 de 7 fechadas.** Restam a §4 (uma pergunta ao IdP) e a §7 (implementação
de limite de taxa). Nenhuma exige mudança estrutural.

**Veredito original da auditoria: NO-GO até fechamento destes itens.** O bloqueio não vem da
topologia — BFF, autoridade no domínio, eventos finos, `If-Match`, DAL e observabilidade
são fundamentos sólidos. Vem de **consistência, recuperação e premissas não demonstradas**.

| # | Pendência | Status |
|---|---|---|
| 1 | Semântica do canal de eventos | ✅ **fechada** — notificação efêmera; durabilidade no domínio |
| 2 | Corrida de cache-aside (stale set) | ✅ **eliminada** pelo [ADR-0007](adr/0007-remover-cache-de-payload.md) |
| 3 | `scopeKey` representa a projeção? | ✅ **eliminada** pelo ADR-0007 |
| 4 | Lock de refresh × política do IdP | ⏳ **aberta** — falta confirmar rotação e detecção de reuso |
| 5 | O cache permanece no baseline? | ✅ **fechada** — removido, ADR-0007 |
| 6 | Modelo de taxa de acerto sem derivação | ✅ **sem objeto** — não há cache a modelar |
| 7 | Limite de taxa e admission control | ⏳ **aberta** |

**Restam duas.** Nenhuma exige mudança estrutural.

---

## 1. Semântica do canal de eventos — ✅ FECHADA

**Decisão: Opção A — notificação efêmera.** O canal SSE não guarda estado.

A separação que resolveu o impasse:

| Evento | Precisa acumular? | Onde a durabilidade vive |
|---|---|---|
| `notificacao.usuario` | **sim** | domínio de notificações, no banco |
| `recurso.alterado` | não | é dica de revalidação |
| `dependencia.alterada` | não | idem |
| `recurso.excluido` | não | a próxima leitura devolve `404` |
| `sessao.revalidar` | não | a próxima leitura resolve |

**Notificação é estado do domínio, não do canal.** Tem endpoint próprio, contador e
histórico paginado. O SSE só avisa "chegou algo novo"; se o frame se perder, o próximo
`GET /notificacoes` reconcilia, porque o dado está no banco.

Consequências normativas:

- Redis Pub/Sub permanece; *at-most-once* deixa de ser problema
- `Last-Event-ID` **não é garantia**; janela máxima de 30 s ou nenhuma
- nenhum documento pode descrever eventos como replayáveis
- a amplificação por replay deixa de existir: não há replay a amplificar
- com o ADR-0007, o relay não invalida nada — é apenas repasse

<details>
<summary>Análise original que levou à decisão</summary>

**Contradição comprovada.** A documentação descreve simultaneamente:

```
Last-Event-ID          →  "me devolva os eventos perdidos"
Redis Pub/Sub          →  at-most-once; eventos perdidos não existem mais
```

E o argumento de compensação também falha:

```
1. domínio altera v42 → v43
2. BFFs fora do ar; evento se perde
3. cache ainda tem v42, dentro do TTL lógico
4. BFF volta; navegador reconecta; router.refresh()
5. o BFF responde v42 — do próprio cache
```

O "refresh completo" **não reconcilia com a fonte de verdade** se ele lê um cache que
perdeu a invalidação.

### Decisão necessária — escolher um contrato

**Opção A — notificação efêmera** (recomendada se o requisito for "ver o estado atual ao
voltar")

- Pub/Sub permanece
- `Last-Event-ID` deixa de ser tratado como garantia; janela máxima de 30 s ou nenhuma
- **toda reconexão executa leitura que ignora ou revalida o cache**
- eventos nunca são descritos como replayáveis em documento algum
- o estado durável vive no banco; o evento é apenas acelerador

**Opção B — replay real** (necessária se o requisito for "processar cada evento, inclusive
os ocorridos offline")

- Redis Streams, Kafka ou outbox persistente
- `Last-Event-ID` vira cursor legítimo
- custo operacional e de retenção maior

### Pergunta que decidiu

> Se o usuário ficar 30 minutos desconectado, ele precisa **receber cada evento** ocorrido,
> ou basta **ver o estado atual** quando voltar?

**Resposta:** basta ver o estado atual, exceto para notificações — que passam a viver no
domínio, com endpoint próprio.

</details>

---

## 2. Corrida de cache-aside (stale set) — ✅ ELIMINADA

O [ADR-0007](adr/0007-remover-cache-de-payload.md) removeu o cache de payload. Sem
cache-aside, não há corrida. Eliminada, não mitigada.

<details>
<summary>Análise original</summary>

**Risco provável, alta severidade, baixa detectabilidade.**

```
T0  requisição A: cache miss
T1  A inicia GET v42 no domínio
T2  mutação B grava v43
T3  evento invalida o cache
T4  A termina o GET antigo e grava v42 no cache
```

A entrada antiga **reaparece depois da invalidação**. Não é resolvido por `scopeKey`,
ETag, TTL, índice de chaves nem coalescing. É o problema que o Facebook resolveu com
leases (Nishtala et al., NSDI 2013).

### Correção, se o cache permanecer (§5)

Watermark de geração por recurso, com comparação e escrita atômicas:

```lua
-- gravação condicional: só aceita se a geração não avançou desde o início da leitura
if redis.call('GET', KEYS[2]) == ARGV[2] then
  return redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[3])
end
return nil
```

```ts
const g0 = await redis.get(`gen:pedido:${id}`)   // antes de buscar no domínio
const dado = await upstream(`/pedidos/${id}`)
await gravarSeGeracaoIgual(chave, dado, `gen:pedido:${id}`, g0, ttl)

// na invalidação: INCR gen:pedido:{id} + DEL das chaves do índice
```

O `Entry` já carrega `versao` — é a base natural para isso.

### Correção alternativa

Remover o cache (§5). Problema eliminado, não mitigado.

</details>

---

## 3. O `scopeKey` representa a projeção? — ✅ ELIMINADA

Eliminada pelo ADR-0007 — mas vale registrar **por que a resposta era não**, porque foi
essa constatação que motivou a remoção.

`_permissoes` é um campo **calculado**. Suas entradas incluem role e regras temporais,
que o `scopeKey` não captura. O caso decisivo é o temporal:

```
t=0     cache grava { editar: true }, ETag "42"
t=120s  o prazo de edição venceu; o domínio calcularia editar: false
t=120s  revalida → versão ainda 42 → 304 → estende frescor, devolve corpo velho
t=∞     enquanto houver tráfego, nunca converge
```

A obsolescência não era limitada pelo TTL. Era **indefinida**.

Causa raiz: a RFC 9110 define o `ETag` como validador da **representação selecionada**, e
estávamos usando um validador do **agregado**. O `304` mentia.

O `ETag` permanece no sistema com **um único uso**: `If-Match` na concorrência otimista,
onde validar o agregado é exatamente o correto.

<details>
<summary>Análise original</summary>

**Premissa assassina.** O `scopeKey` é hash dos grupos ordenados. Isso é suficiente **se e
somente se**:

> duas sessões com o mesmo conjunto de grupos sempre recebem exatamente a mesma
> representação do recurso — independentemente de role, tenant, unidade, vínculo, nível de
> sigilo ou qualquer atributo ABAC.

A documentação fala de `role` em outros contextos. A equivalência nunca foi testada.

**Se falsa, o cache deixa de ser problema de desempenho e vira problema de
confidencialidade**: duas classes reais de autorização compartilhando entrada.

### Ação

Transformar em contrato explícito com o domínio: uma `projectionKey` que identifica a
**forma da resposta**, não o usuário.

```
chave:  pedido:8821:c1
ETag:   "42-c1"
```

**Ressalva de viabilidade.** Se a `projectionKey` só vier *na resposta* do domínio, o BFF
já fez a chamada e o cache não economizou nada. Para funcionar, ela precisa ser derivável
**antes** do lookup — por exemplo, um perfil de autorização resolvido no login e guardado
na sessão, ou uma regra de projeção contratualmente definida.

Isso é complexidade adicional. Ver §5 antes de investir nela.

### E o ETag

Independentemente da decisão sobre cache: o `ETag` é a versão do agregado e **não codifica
a projeção**. Se algum dia houver cache de payload projetado com validador não-projetado,
um usuário que perde acesso revalida com `If-None-Match`, recebe `304` porque a versão não
mudou, e o cache serve a cópia antiga **com o bloco sensível**.

A RFC 9110 define o ETag como validador da *representação selecionada* — a proposta
`"42-c1"` / `"42-c0"` é a leitura correta da norma.

</details>

---

## 4. Lock de refresh × política do IdP — ⏳ ABERTA

**Confirmado: o IdP emite `refresh_token`.** O lock permanece necessário. Falta uma
sub-pergunta, e ela muda o desenho:

> **Há rotação de refresh token? Há detecção de reuso?**

| Resposta | Consequência |
|---|---|
| Sem rotação | `SET NX EX` basta; duplicata é inofensiva |
| Com rotação, sem detecção | duplicata desperdiça um token; tolerável |
| **Com rotação e detecção** | duplicata **derruba a sessão**; o lock vira crítico |

No terceiro caso o lock simples não serve — ele não preserva exclusão mútua sob failover
do Redis. As saídas são renovação proativa e serializada (um processo renova antes de
expirar, os demais só leem) ou fencing token.

**Não implemente o lock antes desta resposta.**

<details>
<summary>Análise original</summary>

O ADR-0002 afirma que renovação duplicada é "inofensiva". **Isso depende do IdP.**

Com rotação e detecção de reuso, o refresh token anterior é invalidado; apresentá-lo de
novo pode ser interpretado como replay e **revogar a família inteira** — derrubando a
sessão. E a mesma documentação lista "rotação com detecção de reuso" como melhoria
prioritária em [04 §11](06-seguranca.md). As duas decisões conflitam.

Some-se a isso que o lock `SET NX EX` não preserva exclusão mútua sob failover do Redis.

### Perguntas ao IdP — antes de projetar qualquer coisa

1. Emite `refresh_token`?
2. Há rotação? Há detecção de reuso?
3. Qual a política para refresh concorrente?
4. Qual o tempo de vida do access token?

**Se não houver `refresh_token`** — possível em alguns IdPs federados — todo o lock é
desnecessário e o ADR-0002 encolhe.

</details>

**Teste obrigatório:** P0-d em [09 §3.2](11-testes.md).

---

## 5. O cache permanece no baseline? — ✅ FECHADA: NÃO

Removido pelo [ADR-0007](adr/0007-remover-cache-de-payload.md).

O que decidiu não foi carga nem taxa de acerto, e sim **corretude**: `_permissoes` depende
de dimensões que a chave e o validador não capturam, e a correção exigiria validador
derivado da resposta — o que obriga o domínio a montar a resposta para responder `304`,
eliminando a economia que justificava o cache.

**Verificação obrigatória antes do deploy:** p99 do domínio por endpoint sob ~300 req/s.
Se sofrer, a resposta é cachear **no domínio**, nunca ressuscitar o cache do BFF.

<details>
<summary>Análise original</summary>

**Decisão de escopo, não de correção.** Fechá-la resolve ou elimina §2 e §3.

O cache de payload protegido não foi demonstrado como necessário. Ele **não** é
pré-requisito para SSE, para autorização nem para sessão. Sem ele:

| Sai | Fica |
|---|---|
| `scopeKey` na chave de cache | `scopeKey` continua sem uso, ou some |
| índice de invalidação | — |
| watermark de geração (§2) | — |
| `projectionKey` (§3) | ETag projetado, se houver cache no navegador |
| invalidação no relay SSE | relay vira só repasse |
| segunda instância de Redis | Redis de sessão permanece |

O custo é carga adicional no domínio — no modelo, de ~53 para ~267 chamadas/s com 2.000
usuários. **É uma medição, não uma suposição**, e é mais barata que qualquer item desta lista.

> **Nota sobre um argumento já usado e incorreto.** A correção [C-011](CORRECOES.md)
> registrou que "o `scopeKey` é controle de segurança, portanto não remova o cache". O
> argumento vale contra *mover o cache para o navegador com ETag não-projetado*. **Não vale**
> contra *não ter cache compartilhado*: sem entrada compartilhada não existe vetor de
> vazamento entre projeções. As duas propostas foram conflatadas.

</details>

---

## 6. Modelo de taxa de acerto sem derivação — ✅ SEM OBJETO

Não há mais cache a modelar. A crítica metodológica permanece registrada em
[C-011](CORRECOES.md) pelo valor da lição: **cardinalidade não é distribuição**, e
substituir uma medida de concentração dentro de uma fórmula de renovação exige derivação
que nunca foi feita.

<details>
<summary>Análise original</summary>

A fórmula usada é `taxa = 1 − 1/v`, com `v` dividido pela "fragmentação efetiva"
(`1/Σpᵢ²`). A segunda é uma medida legítima de concentração — mas **não existe derivação
que autorize substituí-la pelo número de chaves dentro da primeira**. São grandezas
diferentes.

Sobre a mesma população simulada, modelos alternativos produzem:

| Modelo de chegada e TTL | Taxa a 10 leituras/min |
|---|---|
| fórmula atual | 80,3% |
| Poisson + TTL fixo | 73,4% |
| Poisson + TTL deslizante | 85,4% |
| chegadas determinísticas | 65,7% |

A amplitude de 66% a 85% não indica qual é o verdadeiro. Indica que **os dados atuais não
permitem afirmar nenhum deles**.

**Ação:** substituir toda menção a "~80%" por `DESCONHECIDA — medir` e não usar esse número
para decidir arquitetura. A diferença muda a carga no domínio de 53 para 92 chamadas/s.

> Esta pendência substituiu a conclusão de "~80%", que já substituía a conclusão errada de
> "~0%". Nenhuma das três estava fundamentada.

</details>

---

## 7. Limite de taxa e admission control — ⏳ ABERTA

Duas ausências que a documentação não registrava.

**Enumeração.** Os identificadores são sequenciais. O `404` uniforme esconde a resposta,
não o padrão de tentativas. Falta limite de taxa por sessão e por IP nas leituras de
recurso, e alarme sobre taxa anômala de `404` na mesma sessão.

**Saturação.** Alarmar em 60% do teto não impede que uma rajada leve o processo à zona de
filas crescentes. Falta rejeitar trabalho antecipadamente — sem isso, fila e retry
produzem cascata. É o cenário de realimentação positiva:

```
BFF lento → EventSource retenta (intervalo fixo) → mais carga → BFF mais lento
```

Mitigações mínimas: campo `retry:` no stream, limite de renders concorrentes, e resposta
`503` com `Retry-After` acima do limite, em vez de enfileirar.

---

## 8. Itens P1 — não bloqueiam, mas devem vir logo

| Item | Origem |
|---|---|
| Teste de caos SSE com milhares de clientes antes de produção | E1 |
| Painel de p99 da rede BFF → domínio (a média mente) | E1 |
| Análise estática no CI bloqueando DTO sensível cruzando `'use client'` | E1, E2 |
| Benchmark real de CPU por render com árvores reais | E2 |
| Medir abas por usuário, não apenas usuários online | E2 |
| Exigir e testar HTTP/2 fim a fim se múltiplas abas forem legítimas | E2 |
| Benchmark de fan-out por destinatário | E2 |
| Chaos do Redis de sessão; definir RTO e RPO | E2 |
| Instrumentar event-loop lag e in-flight renders | E2 |
| Validar o pipeline de CSP por hash com `build` limpo | E2 |
| Renomear "Custo medido" para "estimativa" no ADR-0006 | E2 |
| Modelo econômico do cache antes de mantê-lo | E2 |

---

## 9. O que a auditoria confirmou como sólido

Registrado para que a correção destes itens não seja lida como refutação do desenho:

- BFF coerente com o requisito e com a RFC 10017
- autoridade única de autorização no domínio
- defesa contra vazamento pelo payload RSC
- concorrência otimista por `If-Match`
- eventos SSE finos
- observabilidade com cuidado deliberado de privacidade
- runbooks de reconexão incomumente detalhados
- documentação que registra os próprios erros
- testes negativos de autorização, especialmente o que assere **ausência** de frame SSE
- modelo de capacidade reproduzível, com premissas marcadas por confiança

O problema não é a topologia. É que **as garantias de consistência entre cache, eventos,
versões e recuperação ainda não têm contrato formal** — e que números de simulação foram
apresentados em alguns pontos com peso de evidência.
