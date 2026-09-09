# 00 — Caso ilustrativo: Pedido de Compra

Este documento fornece o caso ilustrativo usado pelos demais textos da arquitetura do front-end.
Ele dá nomes concretos a recursos, atores e eventos.

O caso **não é uma especificação funcional do backend**. Nomes, identificadores e regras de
negócio existem aqui apenas para exercitar decisões do segmento de front-end. Quando um exemplo
deste arquivo conflitar com um contrato do domínio ou com um ADR vigente, o contrato ou o ADR
prevalece.

A documentação usa três termos de forma consistente:

- **Cliente**: código React que executa no navegador.
- **BFF**: parte servidor do front-end, implementada com Next.js no processo Node.
- **Domínio**: API Spring Boot consumida pelo BFF e responsável por regra de negócio, ACL e
  projeção dos dados.

O caso foi escolhido porque exercita, em uma única tela, as decisões que mais afetam o desenho do
front-end: composição de dados, autorização por grupo, bloco sensível, cache com escopo,
concorrência otimista, atualização em tempo real e rastreamento distribuído.

## 1. Recursos do caso

A tela principal apresenta um `Pedido` de compra e informações relacionadas que vêm de mais de
um domínio.

| Papel no caso | Recurso | Domínio | Por que aparece na documentação |
|---|---|---|---|
| agregado principal | `Pedido` | Pedidos | recurso central da tela e das mutações |
| composição | `ItemDePedido` | Pedidos | filhos renderizados junto com o pedido |
| dependência | `Remessa` e `LoteDeEstoque` | Logística / Estoque | alteração externa pode mudar o estado visível do pedido |
| bloco sensível | `CondicaoComercial` | Comercial / Financeiro | possui ACL própria e pode não existir no payload do usuário |
| referência | `Fornecedor` | Cadastro | dado de apoio usado na apresentação |

As relações relevantes são simples. Um pedido contém itens, pode depender de uma ou mais remessas
e pode possuir uma condição comercial. O domínio calcula estados derivados, como `EM_RISCO` ou
`FATURADO`; o Cliente e o BFF não recalculam essas regras.

Para os exemplos, o pedido principal é `8821`. A remessa `4410` e o pedido relacionado `7002` são
identificadores ilustrativos usados apenas para tornar os fluxos rastreáveis.

## 2. Atores e visibilidade

Os atores abaixo foram escolhidos para separar **role**, que orienta a experiência de navegação,
de **grupo**, que participa da autorização de dados no domínio.

| Ator | Roles | Grupos | Resultado esperado |
|---|---|---|---|
| `gabrigas` | `OPERADOR` | `OPS-NORDESTE` | vê o pedido e o conteúdo operacional |
| `marina` | `OPERADOR` | `OPS-NORDESTE`, `COMERCIAL-NORDESTE` | vê o conteúdo operacional e a condição comercial |
| `rafael` | `ADMIN` | `OPS-NORDESTE` | vê recursos de administração, mas não ganha acesso automático ao bloco comercial |
| `carla` | `OPERADOR` | `OPS-SUL` | não conhece o pedido `8821`; o domínio responde `404` |

A role pode alterar menu, rota disponível ou ação oferecida pela interface. Ela não substitui a
ACL do domínio. Da mesma forma, `_permissoes` orienta a interface, mas não autoriza uma operação.
O domínio reavalia a operação quando recebe a requisição.

## 3. Tela ilustrativa

A tela alvo é `/pedidos/8821`. Ela combina conteúdo renderizado no servidor com pequenas ilhas de
interatividade.

| Bloco da tela | Como o front-end obtém | Onde renderiza | Política relevante |
|---|---|---|---|
| cabeçalho, itens e estado derivado | DAL durante a renderização | Server Components | sem cache no BFF; dedup por renderização |
| remessas e lotes | DAL durante a renderização | Server Components; ilha apenas quando necessária | sem cache no BFF |
| condição comercial | DAL opcional | Server Component | `private`, `no-store`; ausência vira `null` |
| timeline paginada | `/{zona}/api/bff/` após a montagem | ilha client | React Query; paginação incremental |
| ações | payload do pedido + Server Actions | interface client | `_permissoes` para UX; domínio decide de novo |
| atualização em tempo real | `/api/stream` | `StreamProvider` | uma conexão SSE por aba |

O domínio projeta o payload antes de devolvê-lo. O BFF **não mascara** campos sensíveis. Se
`gabrigas` não pode conhecer `CondicaoComercial`, o objeto não deve existir na resposta recebida
pelo BFF para esse usuário e não pode aparecer no HTML, no flight payload do App Router, em props
serializadas ou em atributos `data-*`.

## 4. Cenários arquiteturais

Os cenários abaixo não tentam cobrir o processo de compra. Cada um existe para tornar observável
uma decisão da arquitetura do front-end.

### C1 — Mesma rota, payloads diferentes

**Objetivo arquitetural:** demonstrar projeção no domínio e ausência de mascaramento no Cliente ou
no BFF.

Dado que `gabrigas` e `marina` abrem `/pedidos/8821`, quando o domínio responde às leituras da
página, então ambos recebem o conteúdo operacional, mas apenas `marina` recebe a condição
comercial. O conteúdo entregue a `gabrigas` não contém preço negociado, margem, contrato ou outro
campo do bloco sensível em nenhuma camada de serialização do front-end.

### C2 — Evento externo altera uma dependência

**Objetivo arquitetural:** demonstrar SSE, invalidação de cache e atualização de uma tela montada.

Dado que um evento externo altera um lote usado pela `Remessa 4410`, quando o domínio recalcula o
pedido `8821` e o torna `EM_RISCO`, então o BFF recebe um evento autorizado e o relaya como evento mínimo. `gabrigas` e `marina` atualizam a tela sem
recarregamento completo. `carla` não recebe frame relacionado ao pedido.

### C3 — Evento externo altera o pedido diretamente

**Objetivo arquitetural:** demonstrar que estado derivado e capacidades vêm do domínio.

Dado que o pedido `8821` é faturado externamente, quando a tela é revalidada, então o novo payload
traz `status = FATURADO` e capacidades atualizadas. Os controles incompatíveis desaparecem porque
a interface renderiza `_permissoes`; o Cliente não contém uma regra própria do tipo “se faturado,
não editar”.

### C4 — Usuário altera uma dependência

**Objetivo arquitetural:** demonstrar Server Action, concorrência e propagação para outras telas.

Dado que `gabrigas` remove a `Remessa 4410` do pedido `8821`, quando confirma a operação, então a
Server Action revalida a sessão, valida a entrada e envia a versão conhecida com `If-Match`. O
domínio aplica a regra, recalcula os pedidos afetados e emite os eventos correspondentes. O BFF
invalida o cache e outras abas revalidam apenas o estado que pode ter mudado.

### C5 — Alteração aparece em outra listagem

**Objetivo arquitetural:** demonstrar a separação entre atualização otimista e sincronização entre
navegadores.

Dado que `gabrigas` altera o estado do pedido `8821` em `/pedidos`, quando a operação é aceita,
então sua interface pode confirmar a transição otimista pela resposta HTTP. Outros navegadores
recebem apenas um evento fino, como `{ tipo, id, versao, escopo }`, e decidem se a consulta
montada precisa ser invalidada. O evento não transporta o registro completo.

### C6 — Mudança em bloco sensível não produz sinal para não autorizados

**Objetivo arquitetural:** demonstrar que o canal em tempo real também respeita a ACL.

Dado que `CondicaoComercial` do pedido `8821` muda, quando o domínio resolve os destinatários,
então `marina` pode receber um evento e atualizar o bloco. `gabrigas` não recebe evento vazio,
marcador genérico nem qualquer indicação de que o bloco existe.

### C7 — Acesso é revogado durante a sessão

**Objetivo arquitetural:** demonstrar que autorização não é congelada no login nem na abertura do
SSE.

Dado que `gabrigas` perde o grupo `OPS-NORDESTE` com a página aberta, quando o domínio avalia a
próxima emissão, então ele deixa de ser destinatário. Na próxima leitura, o domínio responde
`404`. O front-end trata a ausência de forma neutra, sem revelar grupo, regra ou existência do
registro.

### C8 — Dois usuários editam a mesma versão

**Objetivo arquitetural:** demonstrar concorrência otimista e contrato de erro público.

Dado que `gabrigas` e `marina` editam o pedido a partir da mesma versão, quando o segundo envio usa
um `If-Match` desatualizado, então o domínio responde `409` com um erro normalizado, por exemplo
`{ "codigo": "REGISTRO_DESATUALIZADO", "supportId": "..." }`. O front-end não expõe stacktrace,
nome de classe, SQL ou detalhe interno do Spring.

### C9 — Exclusão

**Objetivo arquitetural:** demonstrar confirmação explícita, mutação, invalidação e reação ao
evento de exclusão.

Dado que uma exclusão é permitida pelo estado atual, quando o usuário confirma a operação, então
a Server Action executa a mutação com a versão conhecida. Após sucesso, o cache relacionado é
invalidado. Telas montadas que recebem `recurso.excluido` removem o estado obsoleto e navegam para
um destino válido.

## 5. Contratos exercitados pelo caso

### 5.1 Leitura e escrita

O mesmo recurso pode atravessar caminhos diferentes conforme a origem da operação:

```text
renderização precisa do dado
Server Component → DAL → cache → upstream → Domínio

usuário altera estado
Client Component → Server Action → upstream → Domínio

navegador busca após a montagem
Client Component → /{zona}/api/bff/* → upstream → Domínio
```

O servidor Next.js não chama seus próprios Route Handlers para obter dados de renderização.
Leituras necessárias para montar a página entram pela DAL. Escritas iniciadas pelo usuário entram
por Server Action. Route Handlers existem para leituras iniciadas no navegador depois da
montagem.

### 5.2 Cache

**O BFF não cacheia payload de recurso protegido.** Ver
[ADR-0007](adr/0007-remover-cache-de-payload.md).

| Mecanismo | Escopo | Efeito neste caso |
|---|---|---|
| `cache()` do React | uma renderização | `Cabecalho`, `Itens` e `Relacionados` chamam `getPedido('8821')`; uma busca só |
| React Query | uma aba | listagem e timeline paginada |
| Redis | apenas sessão | nenhum payload |

A listagem paginada no Cliente não é uma segunda fonte de verdade para o mesmo dado já
buscado pela renderização — ver [ADR-0005](adr/0005-tanstack-query-com-escopo-limitado.md).

### 5.3 Tempo real

Cada aba mantém uma única `EventSource` com `GET /api/stream`. O BFF abre a conexão upstream com o
domínio, relaya apenas eventos autorizados e usa uma allowlist para reserializar o contrato.

Um evento de atualização carrega somente o necessário para decidir revalidação:

```text
event: recurso.alterado
id: 01J9F2K7T3
data: {"tipo":"pedido","id":"8821","versao":42,"escopo":"pedidos:lista"}
```

O BFF invalida o cache **antes** de entregar o evento ao Cliente.

> ⚠️ **Retomada em aberto.** `Last-Event-ID` **pede** retomada; só há retomada se o servidor
> tiver guardado os eventos, o que Redis Pub/Sub não faz. E "revalidar o estado atual" não
> reconcilia se a revalidação lê um cache que perdeu a invalidação. Ver [PENDENCIAS.md](PENDENCIAS.md) §1.

### 5.4 Observabilidade

Uma ação iniciada pelo usuário cria um trace que pode atravessar Cliente, BFF e Domínio:

```text
ui.pedido.remover_remessa
  → Server Action
    → bff.pedidos.remessas.delete
      → HTTP para o domínio
        → pedidos.remessa.remover
```

O navegador exporta telemetria para `/api/otel/v1/traces`, no próprio BFF. O BFF controla taxa,
tamanho e atributos antes de encaminhar ao coletor. Tokens, ids de sessão, nomes de grupo, valores
de formulário e outros dados pessoais não entram nos spans.

## 6. Resultados observáveis

O caso é considerado coerente com a arquitetura quando estes resultados podem ser verificados:

1. `gabrigas` nunca recebe campos de `CondicaoComercial` do pedido `8821`, inclusive no flight
   payload ou em props serializadas.
2. Uma alteração externa relevante aparece nas telas autorizadas em até 2 s, sem recarregamento
   completo.
3. Uma mutação concluída em uma sessão pode atualizar outra sessão autorizada pelo canal SSE.
4. `carla` não recebe frames SSE relativos ao pedido `8821`.
5. Erros públicos não expõem stacktrace, classe, SQL ou detalhes do framework.
6. Uma ação do usuário pode ser correlacionada do navegador ao domínio sem PII nos spans.
7. Após reconexão do SSE, as telas montadas convergem para o estado atual do servidor sem ação
   manual do usuário.

## 7. Como este caso organiza a documentação

Cada documento aprofunda uma parte do mesmo caso. Use esta tabela para transformar uma dúvida do
exemplo em uma leitura dirigida.

| Dúvida levantada pelo caso | Documento principal |
|---|---|
| quem decide e o que pode atravessar uma fronteira | [01 — Camadas](01-camadas.md) |
| onde sessão, cache, DAL, SSE e ilhas moram | [04 — Serviços](04-servicos.md) |
| por que o desenho escolheu BFF, Redis separado, SSE e cache explícito | [05 — Decisões](05-decisoes.md) |
| por que `gabrigas`, `marina` e `carla` recebem resultados diferentes | [06 — Segurança](06-seguranca.md) |
| como correlacionar C2, C4 e C8 sem vazar dados | [07 — Observabilidade](07-observabilidade.md) |
| onde o BFF adiciona ou reduz latência | [08 — Desempenho](08-desempenho.md) |
| como transformar as decisões em módulos e fronteiras de código | [09 — Convenções](09-convencoes.md) |
| como diagnosticar falhas de SSE, Redis ou latência | [10 — Runbook](10-runbook.md) |
| como provar as invariantes e os resultados observáveis deste caso | [11 — Testes](11-testes.md) |
| como seria este caso com e sem camada de cache | [14 — Variantes X e Y](14-variantes-de-cache.md) |
| **qual é a base mínima e o que é opcional** | **[02 — Núcleo](02-nucleo.md)** |

O caso fornece contexto. Os documentos arquiteturais e os ADRs fornecem as regras.
