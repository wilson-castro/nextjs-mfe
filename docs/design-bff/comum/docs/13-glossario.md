---
doc: 13-glossario
publico: [humano, agente]
---

# 13 — Glossário

**Extensão** — componente que pode ser desligado sem que nenhuma resposta HTTP, decisão de
autorização ou contrato de erro mude. Degrada desempenho, frescor ou observabilidade.
Precisa de modo de degradação escrito. Ver [03](03-extensoes.md).

**Núcleo** — os oito elementos obrigatórios, cada um derivado de um requisito. Desligar
qualquer um muda o comportamento do sistema. Ver [02](02-nucleo.md).

**Teste de extensão** — desligue o componente e pergunte se o sistema continua correto.
Sim → extensão. Não → núcleo, e precisa ser justificado como tal. Foi o teste que o cache
de payload reprovou, em quatro pontos.

**ACL** — lista de controle de acesso. Aqui, o conjunto de grupos que dá acesso a um registro.
Resolvida no domínio, no instante da emissão de cada evento.

**ADR** — *Architecture Decision Record*. Documento curto com contexto, alternativas e
consequências de uma decisão. Não se edita: supersede-se.

**BFF** — *Backend for Frontend*. Backend dedicado a uma interface, sob propriedade do time
que a constrói. Nomeado por Phil Calçado na SoundCloud, popularizado por Sam Newman.
Aqui cumpre principalmente papel de guarda de credencial.

**CDN** — rede de servidores distribuídos com cópias do conteúdo perto dos usuários.
Reduz distância e reaproveita conexões persistentes com a origem.

**DAL** — *Data Access Layer*. Módulo que centraliza acesso a dados, aplicando sessão,
escopo de cache e revalidação em um lugar só.

**DPoP** — mecanismo que vincula o token a uma chave privada, tornando inútil um token
roubado isoladamente. RFC 9449.

**ETag** — validador da **representação selecionada** de um recurso. RFC 9110 §8.8.3.
Neste sistema deriva da `versao` do agregado e serve **apenas** ao `If-Match` da
concorrência otimista. Usá-lo também para revalidar cache era incorreto: a representação
varia por projeção, role e tempo — dimensões que a `versao` não captura.

**Fail-closed** — na dúvida, negar. `pode()` retorna `false` quando a permissão está ausente.

**Flight payload** — serialização da árvore de Server Components enviada ao navegador,
embutida em `self.__next_f.push([...])`. É o vetor de vazamento equivalente ao antigo
`__NEXT_DATA__` do Pages Router.

**HATEOAS** — a resposta carrega as transições de estado disponíveis, não só dados.
Nosso `_permissoes` é uma simplificação pragmática desse padrão.

**`If-Match`** — pré-condição de escrita. Previne o problema de *lost update*: o segundo
save com versão desatualizada falha em vez de sobrescrever silenciosamente.

**`If-None-Match`** — revalidação condicional. "Só me mande o corpo se mudou".
Resposta `304 Not Modified` quando não mudou.

**IX.br** — pontos de troca de tráfego brasileiros. Historicamente concentrados em São Paulo,
o que causa tromboneamento.

**JWKS** — conjunto de chaves públicas publicado pelo IdP. O resource server baixa uma vez,
cacheia, e valida assinaturas localmente.

**Last-Event-ID** — cabeçalho enviado automaticamente pelo navegador ao reconectar um SSE.
Ele **pede** retomada; só há retomada se o servidor tiver guardado os eventos. Com Redis
Pub/Sub (at-most-once) não há. Ver [PENDENCIAS.md](PENDENCIAS.md) §1.

**NX / EX** — opções do `SET` do Redis. `NX` = escreve só se a chave não existir.
`EX` = expiração em segundos. Juntas formam o lock simples.

**OIDC** — camada de identidade sobre OAuth 2.0.

**PKCE** — o cliente envia o hash de um segredo na autorização e o valor original na troca.
Protege contra interceptação do código. Recomendado inclusive para clients confidenciais (RFC 9700).

**Root layout** — layout que emite `<html>` e `<body>`. Navegar entre root layouts
diferentes provoca recarga completa.

**RSC** — React Server Components. Executam no servidor, não vão no bundle.

**`scopeKey`** — ⛔ **conceito removido.** Era o hash dos grupos do usuário, usado na chave
de cache do BFF. Não sobreviveu ao [ADR-0007](adr/0007-remover-cache-de-payload.md): sem
cache de payload não há chave compartilhada a particionar. A premissa que o sustentava —
"mesmos grupos ⇒ mesma representação" — nunca foi demonstrada, e `_permissoes` a contradiz
ao depender também de role e de regras temporais.

**RFC 10017 / BCP 212** — *OAuth 2.0 for Browser-Based Applications*, IETF, agosto de 2026.
Classifica o BFF como o mais seguro dos três padrões e exige do BFF defesa contra CSRF e
restrição rígida do destino outbound.

**Retry storm** — `EventSource` retenta em intervalo fixo, sem backoff exponencial garantido.
Um serviço degradado é atacado pelos próprios clientes. Mitigação: campo `retry:` no stream.

**`server-only`** — pacote que transforma importação indevida em erro de compilação.

**SSE** — *Server-Sent Events*. Canal HTTP unidirecional. **Reconexão** é nativa;
**retomada não é** — depende de o servidor manter histórico. A especificação WHATWG define
um tempo de reconexão e permite, sem exigir, que o agente adicione atraso; o controle
confiável é o campo `retry:` enviado pelo servidor.

**Stale set** — corrida de cache-aside em que uma leitura iniciada antes de uma invalidação
regrava a versão antiga depois dela. Exigiria watermark de versão ou lease. **Eliminado**
pelo ADR-0007, que removeu o cache de payload.

**Tromboneamento** — tráfego que sobe até um ponto de troca distante e volta, mesmo quando
origem e destino são próximos.

**TTL lógico vs físico** — frescor versus retenção. Conceito do cache removido pelo
ADR-0007. Registrado porque a interação entre os dois produziu o defeito que motivou a
remoção: o caminho de `304` renovava o frescor e devolvia o corpo antigo, tornando a
obsolescência **indefinida** em vez de limitada pelo TTL.

**Upstream** — o que está rio acima do BFF. Aqui, o domínio Spring Boot.
