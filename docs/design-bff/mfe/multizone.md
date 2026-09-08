# Limitações do Multi-Zones nesta arquitetura

Onze limitações, cada uma cruzada contra um componente específico do nosso desenho — não uma lista genérica de "limitações do Next.js".

---

## 1. Navegação entre zonas é sempre hard navigation — e isso derruba o SharedWorker

Navegar de uma zona para outra descarrega os recursos da página atual e carrega os da nova. Não há como contornar; é o mecanismo de isolamento que dá a independência de deploy.

No nosso desenho, o `SharedWorker` foi a peça desenhada **especificamente para sobreviver a isso**. Ele funciona para troca de *aba*, mas uma hard navigation entre `/pedidos` e `/estoque`:

- descarrega o JS da página, mas o Worker é `Shared` — sobrevive entre documentos do mesmo `origin`
- **a reconexão do `MessagePort` precisa ser re-estabelecida no boot da nova zona**, porque o documento antigo que segurava a referência foi destruído

Isso não quebra o padrão, mas adiciona uma sequência de reconexão que o desenho original não detalhava:

```
zona A descarrega → SharedWorker continua vivo (mantém a conexão SSE)
                  → zona B inicia → StreamProvider da zona B abre NOVA porta
                  → Worker precisa multiplexar entre portas de documentos diferentes,
                    não apenas entre abas da mesma zona
```

**Consequência prática:** cada zona precisa do próprio bootstrap do `StreamProvider`, e o Worker precisa saber descartar portas mortas (documento fechado) sem derrubar a conexão SSE para as portas vivas. Isso é mais estado para gerenciar do que "uma conexão por navegador" sugeria.

---

## 2. `<Link>` não funciona entre zonas — e isso é fácil de esquecer no meio do código

Links para caminho de outra zona precisam de `<a>` puro, porque o `<Link>` sempre tenta fazer prefetch e soft navigation para caminhos relativos, o que não funciona entre zonas.

No nosso caso, isso afeta especificamente:

```tsx
// dentro do MFE Pedidos, link para o MFE Comercial
<a href="/comercial/contratos/8821">Ver contrato completo</a>   // ✅
<Link href="/comercial/contratos/8821">Ver contrato completo</Link>  // ❌ silencioso
```

O erro é **silencioso** — o `<Link>` não falha, ele tenta soft-navegar, o roteador do cliente não encontra a rota na própria zona, e o comportamento observado é inconsistente conforme o estado do router. Isso é o tipo de bug que passa em revisão de código porque parece correto.

**Ação para `AGENTS.md`:** invariante adicional — nenhum `<Link>` pode apontar para fora do prefixo da própria zona; lint customizado que verifica isso contra o mapa de prefixos.

---

## 3. Sem deduplicação de dependências entre zonas

Cada zona carrega seus próprios recursos independentemente; bibliotecas comuns como React podem ser baixadas de novo em cada zona, sem deduplicação automática entre zonas.

Isso incide diretamente no `@erp/nucleo` e no `@erp/ui` que desenhamos:

| Pacote | Efeito |
|---|---|
| `@erp/nucleo` (server-only) | não importa — nunca vai ao bundle do cliente |
| `@erp/ui` (componentes client) | **duplicado em cada zona que o usa** |
| React, React DOM | duplicado em cada zona |

Com 3 zonas, o usuário que navega Pedidos → Estoque → Comercial baixa React três vezes, e a versão do design system três vezes — mesmo que sejam idênticas.

**Isso é o argumento mais forte a favor do Desenho B do turno anterior** (Module Federation restrito à UI): resolve exatamente esta duplicação, sem reintroduzir o problema de vazamento de payload, porque UI compartilhada não carrega dado sensível.

---

## 4. `middleware`/`proxy.ts` não atravessa zonas

Cada zona é uma aplicação Next.js separada, com seu próprio `proxy.ts`. Isso significa que **a CSP com nonce precisa ser gerada de forma idêntica em cada zona**, ou o comportamento diverge silenciosamente entre elas.

Nosso `proxy.ts` do núcleo:

```ts
// precisa ser DUPLICADO (ou compartilhado via @erp/nucleo) em CADA zona
export default function proxy(req: NextRequest) {
  const nonce = ...
  if (!req.cookies.has('__Host-session')) { /* redirect */ }
  // ...
}
```

Se `@erp/nucleo` não incluir o `proxy.ts` como fábrica reutilizável, cada MFE reimplementa a checagem de sessão e a CSP — e diverge com o tempo. Isso é exatamente o tipo de coisa que o critério de "lockstep" do núcleo foi desenhado para prevenir, mas o Multi-Zones não dá nenhum mecanismo nativo para impor — depende inteiramente de disciplina de versionamento do pacote.

**Ação:** `@erp/nucleo` precisa exportar uma fábrica `criarProxy(config)`, não só helpers, para que o `proxy.ts` de cada zona seja uma chamada de uma linha, não uma reimplementação.

---

## 5. `assetPrefix`/`basePath` conflita com rotas de API do BFF

Cada zona precisa de um `basePath` (ou `assetPrefix`) exclusivo para evitar colisão de assets, e URLs de rota devem ser exclusivas por zona — duas zonas tentando servir `/pedidos` colidem.

Isso restringe onde `/api/bff/*` de cada MFE pode viver:

```
❌ MFE Pedidos:   /pedidos/*   +   /api/bff/*      ← colide com MFE Estoque
✅ MFE Pedidos:   /pedidos/*   +   /pedidos/api/*  ← path exclusivo por zona
```

**Isso quebra a convenção do `AGENTS.md`** que definia `app/api/bff/` como caminho padrão para leitura do navegador. Precisa virar `app/pedidos/api/bff/` (ou equivalente), com o prefixo do domínio embutido — mudança de convenção, não só de configuração.

---

## 6. O gateway/rewrite precisa saber rotear `/api/stream` corretamente — e Multi-Zones não cobre isso nativamente

O guia oficial trata do roteamento de **páginas**. O SSE do shell não é uma página — é um handler de streaming que precisa permanecer conectado à zona correta (o shell) independentemente de qual MFE está sendo visualizado.

```
demo-erp.com/pedidos/8821    → rewrite → MFE Pedidos
demo-erp.com/api/stream      → NÃO deve seguir a regra de zona por prefixo,
                                deve sempre ir ao Shell
```

Isso funciona, mas exige que a regra de rewrite trate `/api/stream`, `/api/auth/*` e `/api/otel/*` como **exceções explícitas** que nunca são delegadas a uma zona de MFE — são sempre do shell. Fácil de configurar errado num rewrite genérico por prefixo.

---

## 7. Preview mode / cookies não atravessam soft nav corretamente entre zonas — sintoma documentado

Existe um comportamento documentado do Next: em soft navigation, o Next lê o JSON de props do caminho `/_next`, e cookies específicos de uma rota podem não se propagar a outras rotas na mesma sessão de navegação sem um full reload.

Isso é mais preocupante em Pages Router, mas o princípio subjacente vale para qualquer estado que dependa de cookie **específico de rota** em vez de cookie de domínio. Nosso `__Host-session` é de domínio inteiro (por causa do prefixo `__Host-`), então **não é afetado** — é uma limitação que verifiquei e descartei, mas vale registrar que **qualquer cookie futuro com `path` restrito a uma zona quebraria de forma sutil** ao cruzar para outra zona via link.

---

## 8. Feature flags viram obrigatórios, não opcionais

Como as zonas podem ser lançadas em momentos diferentes, feature flags são recomendados para habilitar funcionalidades de forma coordenada entre zonas.

No nosso caso concreto: se o MFE Comercial subir uma versão nova de `_permissoes` (nova ação, por exemplo `'aprovar'`) antes do MFE Pedidos atualizar o `@erp/contratos`, o `Record` completo do tipo `PermissoesPedido` **quebra a compilação do Pedidos** — que é exatamente o comportamento que desenhamos para pegar esse erro. Mas em runtime, antes do deploy do Pedidos, a ação nova simplesmente não aparece na UI dele. Isso é aceitável, mas precisa ser **decisão consciente**, documentada como parte do contrato de versão do `@erp/contratos`, não descoberta em produção.

---

## 9. Otimização de código não atravessa fronteira de zona

Divisão de código e lazy loading acontecem dentro de cada zona; essas otimizações não se estendem além da fronteira.

Combinado com o item 3, isso significa: **o `<Suspense>` do `FragmentoRemoto`** que desenhamos no turno anterior busca HTML *sobre HTTP* do MFE Comercial — isso é independente desta limitação, porque não é code-splitting, é uma chamada de rede. Mas se algum dia você quisesse compartilhar um componente de gráfico pesado entre Pedidos e Comercial via import direto (não via fragmento HTTP), ele seria empacotado duas vezes, sem chance de tree-shaking cruzado.

---

## 10. Monorepo é "conveniente", não obrigatório — mas sem ele, o custo de manter contratos sincronizados sobe

Zonas podem viver em qualquer repositório, mas colocá-las num monorepo facilita compartilhar código; times com repositórios separados precisam de pacotes npm públicos ou privados.

Você já definiu multi-repo (`erp-nucleo`, `erp-shell`, `erp-mfe-*`). Isso é suportado, mas **descarta a opção de deploy único** — em Vercel, monorepo permite implantar todas as zonas afetadas com um único `git push`; multi-repo exige orquestração de deploy própria (pipeline que sabe a ordem de publicação: `@erp/nucleo` → `@erp/contratos` → cada MFE).

**Isso não é limitação do Multi-Zones em si — é o preço da escolha multi-repo**, mas vale que o documento de decisões registre que você abriu mão do deploy atômico ao escolher multi-repo, e que o gate de lockstep do CI (que já desenhamos) é o que substitui essa atomicidade.

---

## 11. Nenhum mecanismo nativo de contrato entre zonas — health check e circuit breaker são seus

O Multi-Zones não tem primitiva de "esta zona está fora do ar, degradar graciosamente" — isso é inteiramente o que o nosso `FragmentoRemoto` (com `try/catch` + timeout de 2s) supre. Vale deixar explícito que essa robustez **não vem do framework**, vem inteiramente do desenho que fizemos por cima dele. Se alguém remover aquele `try/catch` achando que é boilerplate, a falha do MFE Comercial derruba a renderização inteira do MFE Pedidos.

---

# Resumo: o que muda no nosso desenho por causa disso

| Limitação | Ação necessária no nosso desenho |
|---|---|
| Hard navigation | `SharedWorker` precisa gerenciar portas por documento, reconectar no boot de cada zona |
| `<Link>` entre zonas | invariante novo + lint: `<a>` obrigatório fora do próprio prefixo |
| Sem dedup de bundle | reconsiderar MF só para `@erp/ui` (Desenho B do turno anterior) |
| `proxy.ts` por zona | `@erp/nucleo` precisa exportar fábrica `criarProxy()`, não só helpers |
| `basePath` colide com `/api/bff` | convenção de rota muda: `app/{zona}/api/bff/*` |
| Rotas do shell (`/api/stream`, `/api/auth`) | exceção explícita no rewrite, nunca delegadas a zona |
| Cookie de rota restrita | não usar `path` restrito em nenhum cookie futuro |
| Contrato assíncrono entre deploys | `@erp/contratos` com janela de depreciação já cobre; documentar como decisão |
| Sem code-splitting cruzado | aceitável — fragmento é HTTP, não import |
| Multi-repo sem deploy atômico | pipeline de publicação com ordem definida; gate de lockstep já cobre a consistência |
| Sem circuit breaker nativo | o `try/catch` do `FragmentoRemoto` é obrigatório, não estético — marcar como núcleo |

A limitação mais séria para nós é a **3** (sem dedup de bundle) combinada com a **1** (hard navigation destrutiva). Juntas, elas empurram na direção de reconsiderar Module Federation restrito à UI compartilhada — não para resolver ACL ou composição, que o Multi-Zones já resolve bem, mas para parar de pagar o custo de baixar React e o design system a cada travessia de zona.

Quer que eu escreva isso como ADR-0008, com a decisão explícita de aceitar essas limitações (ou de adotar MF-para-UI como mitigação da 3)?