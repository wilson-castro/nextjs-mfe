# Repositórios da base MFE

Cada subdiretório é um repositório git independente. `repos/` é ignorado pelo git externo.

    node scripts/registry.mjs up     # sobe o Verdaccio em :4873
    node scripts/registry.mjs down

Ordem de publicação, sempre: erp-contratos -> erp-nucleo -> consumidores.
