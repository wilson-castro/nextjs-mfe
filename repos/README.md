# Repositórios da base MFE

Cada subdiretório é um repositório git independente, registrado como submódulo de
nextjs-mfe. `repos/` é rastreado; só `.verdaccio/storage/` e `.verdaccio/verdaccio.pid`
são ignorados.

    node scripts/registry.mjs up     # sobe o Verdaccio em :4873
    node scripts/registry.mjs down

Ordem de publicação, sempre: erp-contratos -> erp-nucleo -> consumidores.
