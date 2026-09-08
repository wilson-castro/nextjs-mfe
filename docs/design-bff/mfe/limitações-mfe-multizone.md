# Questões de infraestrutura fora da Vercel

O documento 08 já modela latência assumindo co-localização. O que falta é tudo que a Vercel resolve *silenciosamente* e que agora vira seu problema, item por item, cruzado com decisões já tomadas.

---

## 1. `assetPrefix`/`basePath` exige um proxy de camada 7 que você mesmo opera

Na Vercel, o roteamento entre zonas é um recurso da plataforma. Fora dela, você precisa de nginx, Traefik, Envoy ou um API Gateway fazendo:

```nginx
location /pedidos/ {
    proxy_pass http://mfe-pedidos:3000;
}
location /estoque/ {
    proxy_pass http://mfe-estoque:3000;
}
location /api/stream {
    proxy_pass http://shell:3000;   # exceção: sempre o shell, nunca a zona
    proxy_buffering off;             # já sabemos que isso é obrigatório
    proxy_read_timeout 120s;         # > heartbeat × 3
}
location / {
    proxy_pass http://shell:3000;
}
```

**O que isso adiciona à sua lista de responsabilidades:**

| Preocupação | Quem resolve na Vercel | Quem resolve agora |
|---|---|---|
| Roteamento por prefixo | Edge Network | você, no nginx/Traefik |
| `X-Accel-Buffering: no` para SSE | não se aplica (Vercel não bufferiza) | você, e precisa lembrar em **todo** proxy na frente do stream |
| TLS termination | automático | você, com cert-manager ou equivalente |
| Roteamento de assets `_next/*` por zona | automático | você, replicando a regra de `assetPrefix` no proxy |

O ponto crítico: **se você tiver múltiplas camadas de proxy** (CDN → load balancer → ingress → pod), a regra de buffering e timeout precisa estar correta em **cada uma**. Isso é o R-2 do documento 06 (ciclo permanente por timeout) multiplicado pelo número de saltos.

---

## 2. Você precisa decidir onde cada zona roda, e isso reabre o documento 08 inteiro

O modelo de latência assume `RTT_lan ≈ 1 ms` entre BFF e domínio, com o alarme explícito: se passar de 5 ms, a arquitetura se inverte.

Com múltiplas zonas Next.js, a pergunta se multiplica: **cada MFE precisa estar tão perto do domínio quanto o shell está do MFE**.

```
Usuário → Shell → MFE Pedidos → domínio Pedidos     (3 saltos de rede)
                → MFE Comercial → domínio Comercial  (fragmento, +1 salto)
```

Se você não tiver os cinco processos (shell + 3 MFEs + fragmento cross-MFE) na mesma VPC/rede, o cálculo do documento 08 §2 muda para cada perna independentemente. **Isso não é teórico**: é comum, ao sair da Vercel, colocar os MFEs em contêineres separados por time, às vezes até em clusters Kubernetes diferentes por questão de governança — e aí você reproduz o cenário "premissa assassina" três vezes.

**Ação concreta:** meça `RTT_lan` **por par** (shell↔pedidos, pedidos↔domínio-pedidos, pedidos↔comercial-BFF, comercial-BFF↔domínio-comercial), não uma vez só.

---

## 3. Build e cache de imagem por zona — sem a otimização automática da Vercel

Cada zona é uma aplicação Next.js standalone. Fora da Vercel, cada uma precisa de:

```dockerfile
FROM node:20-alpine AS builder
# next.config.js com output: 'standalone' — obrigatório fora da Vercel
RUN npm run build

FROM node:20-alpine AS runner
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
CMD ["node", "server.js"]
```

Sem `output: 'standalone'`, cada imagem carrega `node_modules` inteiro — e como você tem 4+ aplicações Next.js (shell + N MFEs), isso multiplica tempo de build, tamanho de imagem e superfície de CVE por dependência.

**Questão que precisa de decisão explícita:** cache de build compartilhado entre zonas (Turborepo remote cache, ou registry de camadas Docker) — sem ele, cada MFE rebuilda React e Next do zero a cada deploy, o que é caro em CI próprio (você paga o compute, não a Vercel).

---

## 4. Health check e liveness/readiness — cada zona precisa dos seus, com semântica correta para SSE

Isto cruza direto com o R-6 (conexões zumbi) e o item de drenagem no `SIGTERM` do documento 06.

```yaml
# k8s, por zona
livenessProbe:
  httpGet: { path: /api/health, port: 3000 }
readinessProbe:
  httpGet: { path: /api/health, port: 3000 }
lifecycle:
  preStop:
    exec:
      command: ["node", "drenar-sse.js"]   # já desenhamos isso
terminationGracePeriodSeconds: 45           # > tempo de drenagem em lotes
```

**O detalhe que a Vercel esconde e agora é seu:** o handler de `/api/stream` precisa **não** ser coberto pelo mesmo readiness probe que o resto da aplicação, porque ele é de longa duração — um rolling update ingênuo mata conexões SSE ativas sem drenagem se você não configurar `preStop` corretamente.

---

## 5. Redis: você monta a topologia, não usa Upstash/KV gerenciado

O documento 06 já resolveu a questão de **quantas instâncias** (uma, após o ADR-0007). Fora da Vercel, sobra:

| Questão | Decisão necessária |
|---|---|
| Redis gerenciado (ElastiCache, cluster próprio) vs. self-hosted | impacta RTO/RPO da sessão |
| Failover | sentinel ou cluster mode — sem isso, uma instância cai e desloga todo mundo |
| Rede | Redis precisa estar na mesma VPC que **todos os BFFs** (shell + N MFEs), não só um |
| TLS entre BFF e Redis | obrigatório se atravessar rede não confiável |

O ponto que a arquitetura atual não cobre: **com múltiplos MFEs, todos compartilham a mesma sessão** (ela é do shell). Isso significa que o Redis de sessão vira um **ponto de acoplamento entre zonas com ciclos de deploy independentes** — se o MFE Comercial for deployado numa VPC diferente por engano, ele perde acesso à sessão, e o erro se manifesta como "usuário deslogado sem motivo" (já documentado no runbook), mas com uma causa nova.

---

## 6. Certificado e roteamento de domínio único — a exigência de "uma origem só" fica mais cara

O ADR de CSP exige `connect-src 'self'` e uma origem única para que SSE, API e telemetria passem todos pelo BFF. Isso significa:

```
demo-erp.com  →  um único certificado TLS
              →  wildcard ou SAN cobrindo todos os paths, não subdomínios
```

Na Vercel, isso é "adicionar um domínio". Fora dela, é operar renovação de certificado (cert-manager + Let's Encrypt, ou certificado comprado) para o **ponto de entrada único**, e garantir que nenhum MFE tente expor porta própria publicamente — todo tráfego externo passa pelo mesmo load balancer, o que é uma regra de firewall/security group que precisa ser mantida manualmente conforme você adiciona zonas.

---

## 7. Observabilidade: sem OTel automático da plataforma, o pipeline inteiro é seu

O documento 06 já desenha `instrumentation.ts` e o coletor OTel. Fora da Vercel:

- você opera o **coletor** (não é um serviço gerenciado incluso)
- correlação de trace entre shell → MFE → domínio precisa que **todas as zonas** exportem para o mesmo backend, com o mesmo formato de `trace_id`
- **cada zona tem seu próprio processo Node**, logo seu próprio `instrumentation.ts` — divergência de configuração entre eles quebra silenciosamente a continuidade do trace, exatamente o tipo de coisa que o critério de "núcleo em lockstep" foi desenhado para prevenir, mas que só é imposto via CI, não pela plataforma

---

## 8. Zero-downtime deploy multiplicado por N zonas

Na Vercel, cada deploy é atômico e instantâneo por padrão. Fora dela, com Kubernetes ou similar, rolling update é seu — e cada MFE tem seu próprio ciclo. Isso interage com o item 8 do turno anterior (feature flags): **como você não tem deploy atômico multi-zona**, uma janela em que o Shell já está na v2 mas o MFE Comercial ainda está na v1 é normal, não exceção. A compatibilidade de contrato (`@erp/contratos` com depreciação de 2 minors) deixa de ser boa prática e vira **requisito de correção**, porque essa janela vai acontecer toda vez.

---

## 9. Rate limiting e DDoS na borda — a Vercel absorve isso, você não

O R-3 (retry storm) e o R-4 (tempestade de reconexão) do documento 06 assumem que existe alguma camada absorvendo picos antes de chegar ao processo Node. Na Vercel, a Edge Network faz parte disso. Fora dela:

- você precisa de rate limiting na borda (nginx `limit_req`, ou um WAF) **antes** do tráfego chegar ao shell
- isso é ainda mais crítico porque o SSE já é um vetor natural de amplificação, e agora não há rede da Vercel absorvendo a tentativa de reconexão em massa

---

## 10. CDN para a zona pública — você perde o "de graça" da Vercel

O documento 06 conclusão 5 diz que a zona pública sai do CDN e não sofre com a localização da origem. Isso pressupõe **ter um CDN configurado** — na Vercel, automático. Fora dela, você precisa contratar/operar CloudFront, Cloudflare ou Fastly na frente das rotas `(publico)`, com invalidação de cache no deploy. Sem isso, a "vantagem de latência da zona estática" do documento 06 simplesmente não existe — ela vira apenas mais uma rota dinâmica servida pelo mesmo processo Node do shell.

---

# Tabela de decisão — o que precisa virar documento novo ou ADR

| Questão | Onde registrar |
|---|---|
| Topologia de rede por par shell/MFE/domínio, com RTT medido | atualizar documento 08 com medições reais, não só o modelo |
| Proxy de borda: regras de buffering, timeout e rewrite por zona | novo documento de infraestrutura, ou ADR-0009 |
| `output: 'standalone'` obrigatório em todo `next.config.js` | invariante em `09-convencoes.md` |
| Health check dividido: aplicação vs. stream de longa duração | `10-runbook.md`, nova seção |
| Redis compartilhado entre zonas — mesma VPC obrigatória | ADR-0002, nota de atualização |
| Coexistência de versões de contrato como estado normal, não exceção | ADR sobre `@erp/contratos`, reforçar |
| CDN e rate limiting de borda como pré-requisito de deploy | checklist de release, novo item |

A questão que eu resolveria **antes de qualquer código**: você vai operar um único cluster/VPC contendo shell + todos os MFEs + Redis, ou eles serão distribuídos por times com infraestrutura própria? A resposta determina se o alarme de `RTT_lan > 5ms` do documento 08 é uma linha de monitoramento ou o motivo pelo qual a arquitetura inteira precisa ser revisada.