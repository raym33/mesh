# Mesh Search MVP

Private homegrown search for Mesh agents. There is no public UI, no ads, and no massive web indexing. The priority is:

- zero or near-zero cost
- full control over sources
- traceability for every fetch
- JSON responses for agents

## V1 Architecture

```text
Agent / Bridge
  -> Hub Mesh (/api/research/search)
  -> local index in the hub

Manual seed / discovered URL
  -> Hub Mesh (/api/research/jobs)
  -> simple fetch queue
  -> server/search-worker.mjs
  -> cleaned document
  -> local index

Registered seed (RSS / sitemap)
  -> Hub Mesh (/api/research/seeds)
  -> discovery queue
  -> server/search-worker.mjs
  -> newly discovered URLs
  -> fetch jobs or nested sitemap jobs
  -> next scheduled run
```

Components:

- `server/server.js`
  - stores `research` state
  - exposes search, document ingestion, and the job queue
- `server/search-worker.mjs`
  - polls for jobs
  - downloads HTML/markdown/text/XML
  - cleans content and returns an indexable document
- `server/data/network-state.json`
  - persists seeds, documents, domains, jobs, and queries

## Logical Tables

Even though they currently live inside the hub JSON, the model is already split as if they were tables:

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

## Queues

V1 uses a single queue in `research.jobs`.

Current types:

- `fetch`
- `refresh`
- `rss`
- `sitemap`

Simple policy:

- the hub enqueues URLs
- the worker requests a job with `GET /api/research/jobs/poll`
- the job moves to `running`
- the worker returns `completed` or `failed`
- an `rss` or `sitemap` job can discover new URLs and turn them into new jobs
- an active `seed` re-enqueues its next run based on `intervalMinutes`
- when the hub restarts, any old `queued` or `running` job is archived as `failed`
- when the hub restarts, active seeds are scheduled again

## Ranking V1

No external dependencies and no real BM25 for now.

Approximate score:

- match in `title`: high weight
- match in `snippet`: medium weight
- match in `contentText`: low weight
- bonus if all query tokens appear
- small freshness bonus

For the expected V1 scale, this is enough.

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

## Crawl Policy V1

Defaults:

- `allowUnknownDomains = false`
- `allowPrivateHosts = true`

That means:

- an external URL does not enter the queue if its domain is not in the allowlist
- a private or local URL can still enter
- agents can keep querying the local index even if an external domain is not allowed for crawling
- an RSS or sitemap `seed` uses the exact same policy

Allow a domain:

```bash
curl -X POST http://127.0.0.1:4180/api/research/domains \
  -H 'Content-Type: application/json' \
  -d '{"agentId":"mesh-control","host":"docs.nats.io","allowCrawl":true,"priority":8,"notes":"reliable technical docs"}'
```

Change the global policy:

```bash
curl -X POST http://127.0.0.1:4180/api/research/policy \
  -H 'Content-Type: application/json' \
  -d '{"allowUnknownDomains":false,"allowPrivateHosts":true}'
```

Register a seed:

```bash
curl -X POST http://127.0.0.1:4180/api/research/seeds \
  -H 'Content-Type: application/json' \
  -d '{"agentId":"mesh-control","type":"rss","url":"http://127.0.0.1:4180/server/fixtures/research/feed.xml","intervalMinutes":30,"maxDiscoveries":10}'
```

## Approximate V1 Cost

If it runs on the same machine as the hub:

- software: `0`
- APIs externas: `0`
- database: `0`
- queue: `0`

Real cost:

- CPU and RAM on the current host
- local disk for the index
- operating time

Reasonable scale for this version:

- `1k-10k` documents without issues
- `1` fetch worker
- local searches in milliseconds or low hundreds of milliseconds

## Natural Next Steps

1. domain allowlist
2. better extraction for `lastmod`, `guid`, `atom:link`, and richer content
3. query cache
4. retries with backoff
5. moving `research` state into its own file or dedicated database
6. moving from simple scoring to real FTS when needed
