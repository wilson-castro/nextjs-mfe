# ADR-0001 — BFF em vez de token no navegador

**Status:** aceita · **Data:** 2026-08 · **Supersede:** —

## Contexto

A especificação exige que o `access_token` do SSO permaneça no servidor e que o
navegador receba apenas cookie `HttpOnly; Secure; SameSite=Lax`, sem claims, `sub`,
lista de grupos ou expiração acessíveis em JavaScript.

O IETF documenta três arquiteturas para aplicações de navegador em
**RFC 10017 / BCP 212** (agosto de 2026), que classifica o BFF como o mais seguro dos três
e o recomenda para aplicações empresariais e sensíveis.

## Alternativas

| Arquitetura | Tokens em | Segurança | Latência | Complexidade |
|---|---|---|---|---|
| SPA pública com PKCE | navegador | baixa | melhor | menor |
| Token-Mediating Backend | navegador (obtidos via backend) | média | boa | média |
| **BFF completo** | servidor | **alta** | pior sem co-localização | maior |
| Service Worker como client | worker isolado | média-alta | boa | alta |

**Token-Mediating Backend** foi considerado seriamente: o backend só participa da
aquisição do token, não faz proxy de toda requisição, o que reduz latência e
infraestrutura. Foi descartado porque o token volta ao navegador — exatamente o que
a especificação proíbe.

**Service Worker** protege contra XSS que lê `localStorage`, mas não contra atacante
que use o `fetch` da própria página. Pouca adoção e ferramental escasso.

## Decisão

BFF completo. O Next.js atua como confidential client OIDC, obtém e guarda os tokens,
e faz proxy de todo tráfego para o domínio — inclusive o stream SSE.

## Consequências

**Aceitas:**
- salto de rede adicional; mitigado por co-localização (ver [06](../08-desempenho.md))
- sessão com estado, exigindo store compartilhado (ver ADR-0002)
- o BFF vira ponto único de falha para toda a aplicação

**Ganhas:**
- o token não é exposto ao código que executa no navegador

  > Formulação deliberada. **Não** dizemos "não pode ser exfiltrado": SSRF no BFF,
  > comprometimento do processo Node, logging indevido, dependência comprometida ou
  > proxy mal restringido ainda podem revelar a credencial. O que a decisão elimina é
  > o vetor de leitura direta por JavaScript no navegador.
- revogação de sessão é possível a qualquer momento
- o domínio nunca fica exposto à internet

**Limite honesto:** o BFF não impede XSS. Código injetado ainda age como o usuário
através do cookie, enquanto a sessão durar. Reduz janela e alcance, não elimina a ameaça.

## Quando revisitar

Se o requisito de credencial for flexibilizado, ou se a latência entre BFF e domínio
passar de ~5 ms — nesse caso os cálculos de [06](../08-desempenho.md) se invertem.
