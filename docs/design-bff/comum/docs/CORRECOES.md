---
doc: CORRECOES
publico: [humano, agente]
---

# Correções — erros já cometidos neste projeto

Registro de erros reais encontrados em revisão. Cada um custou tempo; nenhum deve
se repetir. Leia antes da primeira contribuição.

---

## C-001 — CSP sem nonce nos cabeçalhos da requisição

**Sintoma:** aplicação funciona em `next dev`, quebra em `next build && next start`.
Hidratação não acontece; console mostra bloqueio de script.

**Causa:** o `proxy.ts` setava apenas `x-nonce` nos cabeçalhos da requisição e a CSP
somente na resposta. O Next lê o nonce do cabeçalho **`content-security-policy` da
requisição** para anexá-lo aos scripts do framework. Sem isso, os bundles não recebem nonce.

**Errado**
```ts
const headers = new Headers(req.headers)
headers.set('x-nonce', nonce)                    // só isto
const res = NextResponse.next({ request: { headers } })
res.headers.set('content-security-policy', csp)  // só na resposta
```

**Certo**
```ts
const headers = new Headers(req.headers)
headers.set('x-nonce', nonce)
headers.set('content-security-policy', csp)      // ← o que o Next lê
const res = NextResponse.next({ request: { headers } })
res.headers.set('content-security-policy', csp)  // ← o que o navegador lê
```

**Extra:** excluir prefetches do matcher, que desperdiçam nonce.

```ts
missing: [
  { type: 'header', key: 'next-router-prefetch' },
  { type: 'header', key: 'purpose', value: 'prefetch' },
]
```

---

## C-002 — Stale closure no `useRevalidacao`

**Sintoma:** depois de um refetch, a tela deixa de reagir a eventos SSE de itens que
entraram na lista.

**Causa:** o `aceita` capturava `data` da renderização em que o handler foi registrado.
Como o efeito não tinha `data` nas dependências, o handler continuava olhando a lista antiga.

**Errado**
```ts
const { data } = useRevalidacao({
  aceita: (ev) => (data?.itens ?? inicial.itens).some(i => i.id === ev.id)
})
```

**Certo** — refs para o valor atual, assinatura estável no efeito:
```ts
const dadosRef = useRef(q.data)
const aceitaRef = useRef(aceita)
useEffect(() => { dadosRef.current = q.data; aceitaRef.current = aceita })

useEffect(() => assinar((nome, ev) => {
  if (aceitaRef.current(ev, nome, dadosRef.current)) invalidar()
}), [assinar, qc])

// e o aceita recebe os dados por parâmetro:
aceita: (ev, _nome, dados) => (dados ?? inicial).itens.some(i => i.id === ev.id)
```

---

## C-003 — Módulo nomeado pela tecnologia alheia

**Erro:** `lib/spring.ts` para o cliente HTTP.

**Problema:** o nome vaza a stack do outro lado. Se o domínio mudar de tecnologia,
você renomeia tudo ou convive com um arquivo que mente. Além disso, o módulo não *é*
o Spring — é o cliente que fala com ele.

**Correção:** `lib/upstream/client.ts`, separando transporte de domínio.

---

## C-004 — Flag booleano descrevendo mecanismo

**Erro:** `spring(path, { naoInterromper: true })`

**Problema:** o nome descreve o mecanismo interno (`notFound()` lança exceção), não a
intenção do chamador. Ilegível no ponto de uso.

**Correção:** duas funções com contratos distintos.

```ts
spring<T>(path, init)          // 404 → notFound()
springOpcional<T>(path, init)  // 404 → null
```

---

## C-005 — Rótulo "SPA" no diagrama

**Erro:** chamar o bloco cliente de "Site — SPA no navegador".

**Problema:** impreciso. Uma SPA renderiza tudo no navegador e busca dados por XHR.
Aqui a renderização é no servidor e o navegador recebe o resultado. O bloco cliente
são **ilhas** de interatividade, não a aplicação inteira.

**Correção:** "Cliente — ilhas no navegador".

---

## C-006 — Especificação referenciando `__NEXT_DATA__`

**Erro:** o critério de aceite original citava `__NEXT_DATA__` como vetor de vazamento.

**Problema:** esse é o mecanismo do Pages Router. No App Router o equivalente é o flight
payload em `self.__next_f.push([...])`. Um teste que buscasse apenas `__NEXT_DATA__`
passaria com o vazamento presente.

**Correção:** teste cobre ambos. Ver [11-testes.md](11-testes.md) §2.

---

## C-007 — Endpoint para terceiros no BFF, sem requisito

**Erro:** o `AGENTS.md` prescrevia um "Caso 4 — consumo por terceiro" com
`app/api/v1/` autenticado por assinatura ou chave de serviço.

**Problema:** não há requisito para isso. A especificação diz que todo tráfego
navegador → domínio passa pelo BFF, e o único consumidor do BFF é o navegador do
próprio usuário. Os eventos externos (`estoque.lote.bloqueado`, `erp.pedido.faturado`)
são publicados **no domínio**, não no front-end.

A origem foi extrapolação: a orientação genérica "Route Handler serve para webhook e
app móvel" é verdadeira em projetos Next.js em geral, e foi arrastada para o documento
normativo sem checagem contra a especificação.

**Por que importa:** um endpoint público no BFF contradiz o invariante 10 e cria uma
superfície alcançável sem sessão dentro do processo que guarda os tokens de todos os
usuários. Prescrição em documento normativo vira implementação meses depois, citando
o próprio documento como justificativa.

**Correção:** Caso 4 reescrito como proibição explícita, com o antipadrão marcado.
Integração externa, se surgir, vai para o domínio Spring — que já é resource server
OAuth e sabe autenticar cliente que não é navegador.

**Lição geral:** conselho genérico sobre o framework não é requisito deste sistema.
Ao consolidar documentação, verifique cada prescrição contra a especificação de origem.

---

## C-008 — Recarregar o recurso na Server Action para reverificar permissão

**Erro:** as Server Actions de mutação recarregavam o recurso e checavam `_permissoes`
antes de chamar o domínio, com o comentário `// não confie no _permissoes que o cliente viu`.

**Três problemas independentes:**

1. **Não recarrega nada.** `getPedido` lê do cache, TTL de 60 s. Numa exclusão logo após
   carregar a tela, ele acerta o cache e devolve o mesmo `_permissoes` que o cliente já
   tinha. A verificação confere o dado consigo mesmo.
2. **Quebra no caso que deveria cobrir.** `getPedido` chama `notFound()`, que **lança**.
   Dentro de uma Server Action isso não produz `{ codigo }` para o `useActionState` — e o
   caminho de 404 é justamente o de acesso revogado, o cenário C7.
3. **Duplica o domínio**, que já recusa com erro normalizado.

**Correção:** remover a pré-verificação. Ver [04 §6.1](06-seguranca.md).

---

## C-009 — Invalidação por `SCAN`

`invalidar(['pedido:8821:*'])` percorre o keyspace inteiro: com 100 mil chaves e
`COUNT=200`, ~500 round trips por invalidação, a cada evento.

**Correção:** índice por recurso, `SMEMBERS` + `DEL`. Ver [07 §9](09-convencoes.md).

O índice resolve o **custo**, não a corrida — ver [PENDENCIAS.md](PENDENCIAS.md) §2.

---

## C-010 — "Reconexão e retomada são do protocolo"

**Erro:** o ADR-0004 apresentava retomada como propriedade nativa do SSE.

**Correto:** reconexão é nativa; o navegador envia `Last-Event-ID` automaticamente. Mas
**o servidor só reenvia o que tiver guardado**, e Redis Pub/Sub é at-most-once.

Agravante: o argumento compensatório — "o `router.refresh()` do `onopen` cobre eventos
perdidos" — **também é falso**, porque esse refresh lê o mesmo cache que perdeu a
invalidação. O raciocínio era circular.

**Correção:** adendo no ADR-0004; contrato em aberto em [PENDENCIAS.md](PENDENCIAS.md) §1.

---

## C-011 — Cardinalidade confundida com distribuição, e conclusão conflatada

**Erro de cálculo.** Usou-se o número de escopos com acesso (12,8) como fator de
fragmentação. A medida correta é a participação inversa: 1,97. A distribuição é
concentrada, e cardinalidade só coincide com distribuição quando ela é uniforme.

**Erro derivado.** Com base no número errado, propôs-se remover o cache do BFF e migrá-lo
para o navegador via `ETag` + `Cache-Control: private`. Essa proposta tinha falha de
segurança: o `ETag` não codifica a projeção, então um `304` pode servir cópia com bloco
sensível a quem perdeu o acesso.

**Erro de conflação — corrigido depois.** Registrou-se então que "o `scopeKey` é controle
de segurança, portanto não remova o cache". O argumento vale contra *mover o cache para o
navegador com validador não-projetado*. **Não vale** contra *não ter cache compartilhado*:
sem entrada compartilhada não há vetor de vazamento. Duas propostas diferentes foram
tratadas como uma.

**Erro de processo.** A mudança arquitetural foi proposta antes de auditar o número que a
motivava.

**Estado atual:** nem 0% nem 80% estão fundamentados. Ver [PENDENCIAS.md](PENDENCIAS.md) §6.

---

## C-012 — Reconexão SSE tratada como detalhe

A reconexão atinge **100% dos conectados de uma vez** e ocorre a cada deploy. Três lacunas:

- amplificação por `Last-Event-ID`: cada evento reenviado vira uma revalidação
- ciclo permanente quando o idle timeout do proxy é menor que o heartbeat — regime, não pico
- `EventSource` sem backoff exponencial garantido: um serviço degradado é atacado pelos
  próprios clientes; o campo `retry:` é a única forma de o servidor controlar isso, e não
  estava sendo usado

**Lição:** ao avaliar canal persistente, analise o **ciclo de vida da conexão** —
estabelecimento, queda e retomada têm perfis de carga próprios. E verifique se o custo de
**voltar** cresce com a duração da queda.

---

## C-013 — Referência normativa desatualizada e afirmação absoluta demais

**Erro A:** a documentação citava `draft-ietf-oauth-browser-based-apps`. O trabalho foi
publicado em agosto de 2026 como **RFC 10017 / BCP 212**.

**Erro B:** o ADR-0001 afirmava que "o token não pode ser exfiltrado". Absoluto demais.
SSRF no BFF, comprometimento do processo Node, logging indevido, dependência comprometida
ou proxy mal restringido ainda podem revelar a credencial.

**Correção:** "o token não é exposto ao código que executa no navegador".

**Erro C, derivado:** a RFC 10017 exige do BFF **restrição rígida do destino outbound**, o
que não constava como invariante. Adicionado em [04 §6.2](06-seguranca.md), com teste em
[09 §3.1](11-testes.md).

---

## C-014 — `refetchPage` não existe no TanStack Query v5

O ADR-0005 justificava a Timeline com `useInfiniteQuery` + `refetchPage`. A API foi
**removida no v5**, em favor de `maxPages`.

Não derruba a decisão — o escopo limitado do Query continua correto —, apenas essa
justificativa. Ver adendo no ADR-0005.

**Lição:** justificativa de ADR que cita API específica envelhece com a biblioteca.
Prefira justificar pela **propriedade** ("revalidação seletiva de página") e citar a API
como nota de implementação.

---

## C-015 — Números de simulação apresentados com peso de evidência

**Erro:** afirmações como "latência não é problema para ninguém", "teto de 284 renders/s"
e "custo medido: 7 ms versus 50 ms" apareciam sem qualificação epistemológica suficiente,
em documentos que servem de referência para decisão.

Nenhum foi medido. O modelo é determinístico e não inclui jitter, perda de pacote, GC,
cold start, contenção de CPU nem enfileiramento — que são justamente os fenômenos que
produzem cauda. O p99.9 do modelo praticamente coincide com o máximo, o que **é evidência
de que não há cauda modelada**.

**Correção:** aviso no topo do [06](08-desempenho.md); percentis rotulados como
"da simulação"; "custo medido" renomeado para estimativa; riscos não modelados listados
explicitamente na §9 daquele documento.

**Lição:** um número reproduzível não é um número medido. Reprodutibilidade é propriedade
do modelo; validade é propriedade da medição.
