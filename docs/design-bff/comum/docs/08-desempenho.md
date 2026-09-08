---
doc: 08-desempenho
publico: [humano, agente]
---

# 08 — Desempenho e topologia

> **Natureza deste documento.** Tudo aqui é **modelo analítico**, não medição de produção.
> As conclusões valem sob as premissas declaradas; várias têm confiança baixa. Os percentis
> apresentados são **percentis da simulação**: o modelo não inclui jitter, perda de pacote,
> retransmissão, garbage collection, cold start, contenção de CPU nem enfileiramento — que
> são justamente os fenômenos que produzem cauda em produção. Não use este documento como
> evidência de capacidade ou de p99.

## 1. Modelo

```
RTT = (distância_geodésica × 1,5 ÷ 102) + 1,5 + last_mile
```

| Parâmetro | Valor | Origem |
|---|---|---|
| Velocidade na fibra | 204.000 km/s | c ÷ 1,47 |
| RTT por km de fibra | 1/102 ms | ida e volta |
| Sinuosidade | 1,5× | rotas seguem dutos, não linha reta |
| Backbone | 1,5 ms | 8–15 saltos domésticos |
| Last mile FTTH | 8 ms | varia; ver seção 5 |

O termo de propagação é **física**. Nenhuma otimização de software o reduz.

## 2. Quando o BFF ganha

```
Sem BFF:  T = n × (RTT_wan + P)
Com BFF:  T = RTT_wan + n × (RTT_lan + P) + R

Ganho > 0  ⟺  (n − 1) × (RTT_wan − RTT_lan) > R
```

Com `RTT_wan = 100`, `RTT_lan = 1`, `R = 15`: **ganha a partir de n ≥ 2**.

**Com uma única chamada, o BFF é ~16 ms mais lento.** Não é gratuito.

| n (cadeia dependente) | Sem BFF (4G) | Com BFF | Ganho |
|---|---|---|---|
| 1 | 120 ms | 136 ms | −16 ms |
| 2 | 240 ms | 157 ms | 1,5× |
| 3 | 360 ms | 178 ms | 2,0× |
| 5 | 600 ms | 220 ms | 2,7× |
| 8 | 960 ms | 283 ms | 3,4× |

## 3. Tela típica, quatro blocos paralelos

| Arquitetura | Tempo até conteúdo visível |
|---|---|
| SPA com API exposta | 220 ms |
| SPA + BFF, fetch no cliente | 221 ms |
| **RSC com BFF** | **77 ms** |

A segunda linha é a lição: **o BFF sozinho não reduz latência.** Ele resolve segurança.
O ganho vem de mover a busca para o servidor.

## 4. Localização do datacenter

Serviços co-localizados; `RTT_lan ≈ 1 ms` em todos os cenários.

### Usuários em todo o Brasil

| Datacenter | Peering bom | Parcial | Trânsito único | p90 |
|---|---|---|---|---|
| **São Paulo** | 23,1 | 23,1 | 23,1 | 44,3 |
| **Brasília** | 24,8 | 31,1 | 37,5 | **34,3** |
| João Pessoa | 36,1 | 46,6 | 57,2 | 47,7 |
| Fortaleza | 37,1 | 48,3 | 59,5 | 48,8 |

São Paulo vence na média (22% dos usuários estão lá). **Brasília vence na cauda** —
é o centróide geográfico e tem a distribuição mais uniforme.

### Usuários concentrados no Nordeste e Sul

| Datacenter | Peering bom | Parcial | Trânsito único |
|---|---|---|---|
| João Pessoa | **26,6** | 46,6 | 66,6 |
| Brasília | 30,0 | **38,5** | 46,9 |
| São Paulo | 32,5 | 32,5 | **32,5** |

**Esta é a tabela decisiva.** Com peering excelente, João Pessoa ganha. Com trânsito
único, João Pessoa entrega 66,6 ms **para usuários do Nordeste** — o dobro do que São
Paulo entregaria para os mesmos usuários.

## 5. Tromboneamento — o fator que a geografia não captura

O roteamento brasileiro é concentrado no IX.br de São Paulo. Um datacenter on-premise
compra trânsito de um ou dois carriers, com cobertura de peering muito inferior à de
um hyperscaler.

| Rota | Ideal | Via São Paulo | Penalidade |
|---|---|---|---|
| Fortaleza → DC em João Pessoa | 17,6 ms | 78,5 ms | +346% |
| Recife → DC em Fortaleza | 18,7 ms | 77,2 ms | +313% |
| Fortaleza → DC em São Paulo | 44,3 ms | 44,3 ms | 0% |

**São Paulo é imune porque o trombone já termina lá.**

### Como validar antes de decidir

```bash
# a partir de máquinas nos escritórios reais, não do seu notebook
mtr -rwzc 100 <ip-candidato>
```

Se o traceroute de Fortaleza para um IP no Nordeste mostra saltos em São Paulo, a coluna
"trânsito único" se aplica. Verifique também presença nos IX.br regionais.

## 6. Peso do last mile

Datacenter em Brasília, peering parcial:

| Acesso | RTT | Página |
|---|---|---|
| Fibra dedicada | 26,1 ms | 73 ms |
| FTTH | 31,1 ms | 78 ms |
| Cabo / ADSL | 38,1 ms | 85 ms |
| 5G | 41,1 ms | 88 ms |
| 4G | 63,1 ms | 110 ms |

A diferença entre 4G e fibra (37 ms) é **maior** que a diferença entre hospedar em São
Paulo e em Fortaleza no cenário de bom peering (14 ms).

## 7. Conclusões operacionais

1. **Nas premissas determinísticas simuladas, não aparece gargalo de latência WAN.**
   Todos os cenários ficam abaixo de 130 ms *no modelo*. O comportamento de cauda em
   produção não foi demonstrado. Sob essas premissas, a localização do datacenter é
   problema de disponibilidade e custo, não de latência.
2. **Quanto pior a localização, maior o valor do BFF** (1,28× em SP, 1,62× em Fortaleza).
   As duas decisões são ortogonais e se compensam.
3. **O SSE passa com folga de duas ordens de grandeza** sobre o requisito de 2 s.
   O gargalo é o processamento no domínio e o debounce, não a rede.
4. **On-premise em site único é uma zona de disponibilidade.** Os 14 ms de diferença
   entre a melhor e a pior localização são irrelevantes perto de um dia de indisponibilidade.
   Resolva RPO/RTO antes da geografia.
5. **A zona pública sai do CDN** e não sofre com a localização da origem. Esse é o
   argumento mais forte para mantê-la estática.

## 8. A premissa assassina

`RTT_lan ≈ 1 ms` pressupõe **co-localização** entre BFF e domínio. É a premissa cuja
falsidade mais destrói a justificativa de composição no servidor.

```
n=4, RTT_lan = 1 ms   →  T ≈  115 ms
n=4, RTT_lan = 120 ms →  T ≈  675 ms   ← pior que a SPA que o BFF substituiu
```

Se o BFF for para uma plataforma serverless numa região e o domínio ficar em outra, a
desigualdade da §2 se inverte e a arquitetura precisa ser reavaliada — inclusive o ADR-0001.

**Alarme:** `RTT_lan` acima de 5 ms. Monitorar continuamente, com p50 **e p99** por
endpoint — a média esconde o problema que importa.

## 9. Riscos de capacidade não cobertos por este modelo

Registrados para não passarem por resolvidos:

| Risco | Por que não está modelado |
|---|---|
| Cauda real (p99, p99.9) | o modelo é determinístico; p99.9 coincide com o máximo, o que é sinal de ausência de cauda |
| Custo de renderização por elemento | coeficiente de confiança baixa; variá-lo em 4× muda o teto em 4× |
| Fan-out de emissão no domínio | 1 evento → N destinatários → N publicações; não modelado |
| Abas por usuário | o modelo trata usuário online como uma conexão; a implementação é uma por aba |
| Saturação sem load shedding | alarmar em 60% não impede a fila de crescer; falta admission control |
| Payload extremo | 500 itens custam ~24 telas típicas *no modelo*; distribuição real desconhecida |

Ver [PENDENCIAS.md](PENDENCIAS.md) §6 e §7.
