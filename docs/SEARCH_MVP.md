# Mesh Search MVP

Buscador casero y privado para agentes Mesh. No hay UI publica, anuncios ni indexacion masiva de internet. La prioridad es:

- coste cero o casi cero
- control total sobre fuentes
- trazabilidad de cada fetch
- respuestas JSON para agentes

## Arquitectura V1

```text
Agente / Bridge
  -> Hub Mesh (/api/research/search)
  -> indice local en el hub

Seed manual / URL descubierta
  -> Hub Mesh (/api/research/jobs)
  -> cola simple de fetch
  -> server/search-worker.mjs
  -> documento limpio
  -> indice local

Seed registrada (RSS / sitemap)
  -> Hub Mesh (/api/research/seeds)
  -> cola de discovery
  -> server/search-worker.mjs
  -> nuevas URLs descubiertas
  -> jobs fetch o sitemap anidado
  -> siguiente pasada programada
```

Componentes:

- `server/server.js`
  - guarda el estado de `research`
  - expone busqueda, alta de documentos y cola de jobs
- `server/search-worker.mjs`
  - hace polling de jobs
  - descarga HTML/markdown/texto/XML
  - limpia contenido y devuelve un documento indexable
- `server/data/network-state.json`
  - persiste seeds, documentos, dominios, jobs y queries

## Tablas logicas

Aunque hoy viven dentro del JSON del hub, el modelo ya esta separado como si fueran tablas:

### `research.seeds`

- `id`
- `type`
- `url`
- `host`
- `active`
- `priority`
- `intervalMinutes`
- `maxDiscoveries`
- `notes`
- `tags`
- `createdBy`
- `lastQueuedAtTs`
- `lastFetchedAtTs`
- `lastError`
- `lastDiscoveryCount`
- `status`

### `research.documents`

- `id`
- `url`
- `canonicalUrl`
- `host`
- `title`
- `snippet`
- `contentText`
- `sourceType`
- `submittedBy`
- `status`
- `tags`
- `checksum`
- `wordCount`
- `publishedAt`
- `createdAtTs`
- `updatedAtTs`
- `fetchedAtTs`

### `research.domains`

- `host`
- `allowCrawl`
- `priority`
- `documentCount`
- `queuedJobs`
- `lastQueuedAtTs`
- `lastFetchedAtTs`
- `failCount`

### `research.jobs`

- `id`
- `type`
- `url`
- `host`
- `status`
- `priority`
- `payload`
- `createdBy`
- `availableAtTs`
- `attempts`
- `workerId`
- `lastError`

### `research.queries`

- `id`
- `agentId`
- `query`
- `host`
- `limit`
- `resultCount`
- `cacheHit`
- `createdAtTs`

## Colas

V1 usa una sola cola en `research.jobs`.

Tipos actuales:

- `fetch`
- `refresh`
- `rss`
- `sitemap`

Politica simple:

- el hub encola URLs
- el worker pide un job con `GET /api/research/jobs/poll`
- el job pasa a `running`
- el worker devuelve `completed` o `failed`
- un job `rss` o `sitemap` puede descubrir nuevas URLs y convertirlas en nuevos jobs
- una `seed` activa vuelve a encolar su siguiente pasada segun `intervalMinutes`
- al reiniciar el hub, cualquier `queued` o `running` viejo se archiva como `failed`
- al reiniciar el hub, las seeds activas vuelven a programarse

## Ranking V1

Sin dependencias externas ni BM25 real por ahora.

Score aproximado:

- match en `title`: peso alto
- match en `snippet`: peso medio
- match en `contentText`: peso bajo
- bonus si aparecen todos los tokens del query
- bonus pequeno por frescura

Para la escala esperada de V1 es suficiente.

## Endpoints

- `GET /api/research/state`
- `GET /api/research/seeds`
- `GET /api/research/domains`
- `POST /api/research/seeds`
- `POST /api/research/policy`
- `POST /api/research/domains`
- `POST /api/research/search`
- `POST /api/research/documents`
- `POST /api/research/jobs`
- `GET /api/research/jobs/poll?workerId=...`
- `POST /api/research/jobs/result`

## Politica de crawl V1

Por defecto:

- `allowUnknownDomains = false`
- `allowPrivateHosts = true`

Eso significa:

- una URL externa no entra en la cola si su dominio no esta en allowlist
- una URL privada o local si puede entrar
- los agentes pueden seguir consultando el indice local aunque un dominio externo no este permitido para crawl
- una `seed` RSS o sitemap usa exactamente la misma politica

Permitir un dominio:

```bash
curl -X POST http://127.0.0.1:4180/api/research/domains \
  -H 'Content-Type: application/json' \
  -d '{"agentId":"mesh-control","host":"docs.nats.io","allowCrawl":true,"priority":8,"notes":"docs tecnicas fiables"}'
```

Cambiar politica global:

```bash
curl -X POST http://127.0.0.1:4180/api/research/policy \
  -H 'Content-Type: application/json' \
  -d '{"allowUnknownDomains":false,"allowPrivateHosts":true}'
```

Registrar una seed:

```bash
curl -X POST http://127.0.0.1:4180/api/research/seeds \
  -H 'Content-Type: application/json' \
  -d '{"agentId":"mesh-control","type":"rss","url":"http://127.0.0.1:4180/server/fixtures/research/feed.xml","intervalMinutes":30,"maxDiscoveries":10}'
```

## Coste aproximado V1

Si corre en la misma maquina del hub:

- software: `0`
- APIs externas: `0`
- base de datos: `0`
- cola: `0`

Coste real:

- CPU y RAM del host actual
- disco local para el indice
- tiempo de operacion

Escala razonable para esta version:

- `1k-10k` documentos sin problema
- `1` worker de fetch
- busquedas locales en milisegundos o pocas decimas

## Siguientes pasos naturales

1. allowlist por dominios
2. extractor mejor para `lastmod`, `guid`, `atom:link` y contenido enriquecido
3. cache por query
4. reintentos con backoff
5. separacion de estado `research` a su propio archivo o base dedicada
6. pasar de scoring simple a FTS real cuando haga falta
