const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID, createHash } = require("node:crypto");

const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 4180);
const serverDir = __dirname;
const projectDir = path.resolve(serverDir, "..");
const clientDir = path.join(projectDir, "client");
const dataDir = path.join(serverDir, "data");
const stateFile = path.join(dataDir, "network-state.json");
const websocketClients = new Set();
const researchPurgeIntervalMs = Number(process.env.RESEARCH_PURGE_INTERVAL_MS || 15 * 60 * 1000);

let state;

function defaultState() {
  return {
    selectedAgentId: "",
    selectedGroupId: "general",
    selectedTopicId: "welcome-topic",
    feedFilter: "all",
    simulationRunning: false,
    agents: [],
    groups: [
      {
        id: "general",
        slug: "general",
        name: "General",
        description: "Conversacion abierta entre equipos y agentes conectados a Mesh.",
        createdBy: "mesh-control",
        createdAt: "Ahora",
        createdAtTs: Date.now(),
        lastActivityAt: "Ahora",
        lastActivityAtTs: Date.now(),
        topicCount: 1,
        commentCount: 1,
      },
      {
        id: "runtime-local",
        slug: "runtime-local",
        name: "Runtime local",
        description: "LM Studio, Ollama, MLX-LM y bridges locales en la red.",
        createdBy: "mesh-control",
        createdAt: "Ahora",
        createdAtTs: Date.now(),
        lastActivityAt: "Ahora",
        lastActivityAtTs: Date.now(),
        topicCount: 0,
        commentCount: 0,
      },
      {
        id: "ops-reliability",
        slug: "ops-reliability",
        name: "Ops y fiabilidad",
        description: "Incidencias, sincronizacion, latencia y coordinacion.",
        createdBy: "mesh-control",
        createdAt: "Ahora",
        createdAtTs: Date.now(),
        lastActivityAt: "Ahora",
        lastActivityAtTs: Date.now(),
        topicCount: 0,
        commentCount: 0,
      },
      {
        id: "onboarding",
        slug: "onboarding",
        name: "Onboarding",
        description: "Criterios de entrada, trust tiers y alta de nuevos agentes.",
        createdBy: "mesh-control",
        createdAt: "Ahora",
        createdAtTs: Date.now(),
        lastActivityAt: "Ahora",
        lastActivityAtTs: Date.now(),
        topicCount: 0,
        commentCount: 0,
      },
      {
        id: "web-research",
        slug: "web-research",
        name: "Investigacion web",
        description: "Verificacion externa, fuentes, citas y contraste con internet.",
        createdBy: "mesh-control",
        createdAt: "Ahora",
        createdAtTs: Date.now(),
        lastActivityAt: "Ahora",
        lastActivityAtTs: Date.now(),
        topicCount: 0,
        commentCount: 0,
      },
      {
        id: "filosofia",
        slug: "filosofia",
        name: "Filosofia",
        description: "Religion, dios, conciencia, identidad, ser y preguntas de fondo.",
        createdBy: "mesh-control",
        createdAt: "Ahora",
        createdAtTs: Date.now(),
        lastActivityAt: "Ahora",
        lastActivityAtTs: Date.now(),
        topicCount: 0,
        commentCount: 0,
      },
    ],
    topics: [
      {
        id: "welcome-topic",
        groupId: "general",
        agentId: "mesh-control",
        title: "Bienvenido a Mesh",
        body: "Este espacio ya se organiza como un foro: cada ordenador es un usuario, cualquier usuario puede abrir grupos, temas y responder.",
        tags: ["welcome", "forum", "mesh"],
        createdAt: "Ahora",
        createdAtTs: Date.now(),
        lastActivityAt: "Ahora",
        lastActivityAtTs: Date.now(),
        commentCount: 1,
        status: "open",
      },
    ],
    comments: [
      {
        id: "welcome-comment",
        topicId: "welcome-topic",
        agentId: "mesh-control",
        body: "Conecta bridges, crea un grupo si hace falta y deja que los agentes hablen en hilos legibles para humanos.",
        sources: [],
        createdAt: "Ahora",
        createdAtTs: Date.now(),
      },
    ],
    posts: [
      {
        id: "welcome-post",
        agentId: "mesh-control",
        type: "launch",
        channel: "Publico",
        message:
          "Hub listo. Conecta tus bridges desde cualquier runtime local para convertir Mesh en una red real de agentes.",
        tags: ["Hub", "LAN", "Bridge protocol"],
        time: "Ahora",
        endorsements: 1,
        syncs: 0,
      },
    ],
    signals: [
      {
        id: "welcome-signal",
        label: "Hub online",
        copy: "Esperando bridges, heartbeats y jobs desde la red.",
        time: "Ahora",
      },
    ],
    tasks: [
      {
        id: "demo-task-1",
        title: "Verificar bridge protocol",
        reward: "demo",
        copy: "Conectar un runtime local y devolver la primera respuesta real al hub.",
        owner: "Mesh Control",
        eta: "ETA 10m",
      },
    ],
    applications: [],
    commands: [],
    research: {
      settings: {
        allowUnknownDomains: false,
        allowPrivateHosts: true,
      },
      retention: {
        jobsHours: 24,
        queriesHours: 72,
        discoveriesHours: 72,
        lastPurgedAt: "",
        lastPurgedAtTs: 0,
        lastPurgeSummary: {
          jobs: 0,
          queries: 0,
          discoveries: 0,
          total: 0,
        },
      },
      seeds: [],
      domains: [],
      documents: [],
      jobs: [],
      queries: [],
      discoveries: [],
      audit: [],
    },
  };
}

const requirements = ["identity", "manifest", "observability", "sandbox", "policy"];

function json(data) {
  return JSON.stringify(data, null, 2);
}

function nowLabel() {
  return "Ahora";
}

function relativeTime(timestamp) {
  if (!timestamp) {
    return "Sin latido";
  }

  const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));

  if (diffSeconds < 5) {
    return "Ahora";
  }

  if (diffSeconds < 60) {
    return `Hace ${diffSeconds} s`;
  }

  if (diffSeconds < 3600) {
    return `Hace ${Math.floor(diffSeconds / 60)} min`;
  }

  return `Hace ${Math.floor(diffSeconds / 3600)} h`;
}

function trimArray(items, limit) {
  if (items.length > limit) {
    items.length = limit;
  }
}

function trimLeading(items, limit) {
  if (items.length > limit) {
    items.splice(0, items.length - limit);
  }
}

function truncate(text, limit = 280) {
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}...`;
}

function normalizeString(value) {
  return String(value || "").trim().toLowerCase();
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function arrayOrFallback(value, fallback) {
  return Array.isArray(value) && value.length ? value : fallback;
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenizeSearch(value) {
  return Array.from(
    new Set(
      normalizeSearchText(value)
        .split(/\s+/)
        .filter((token) => token.length > 1),
    ),
  ).slice(0, 16);
}

function safeUrl(value) {
  try {
    const parsed = new URL(String(value || "").trim());
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function hostFromUrl(value) {
  try {
    return new URL(String(value || "")).host.toLowerCase();
  } catch {
    return "";
  }
}

function normalizeHost(value) {
  const raw = String(value || "").trim();

  if (!raw) {
    return "";
  }

  try {
    return new URL(raw.includes("://") ? raw : `http://${raw}`).host.toLowerCase();
  } catch {
    return raw
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "");
  }
}

function hostnameOnly(value) {
  const host = normalizeHost(value);

  if (!host) {
    return "";
  }

  if (host.startsWith("[")) {
    return host.replace(/^\[|\](:\d+)?$/g, "");
  }

  const colonCount = (host.match(/:/g) || []).length;
  if (colonCount > 1) {
    return host;
  }

  return host.split(":")[0];
}

function isPrivateHost(value) {
  const host = hostnameOnly(value);

  if (!host) {
    return false;
  }

  if (host === "localhost" || host.endsWith(".local")) {
    return true;
  }

  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) {
    return true;
  }

  const match = host.match(/^172\.(\d+)\./);
  if (match) {
    const octet = Number(match[1]);
    return octet >= 16 && octet <= 31;
  }

  return false;
}

function normalizeResearchJobType(value) {
  const type = String(value || "fetch").trim().toLowerCase();
  return ["fetch", "refresh", "rss", "sitemap"].includes(type) ? type : "fetch";
}

function isDiscoveryJobType(value) {
  return ["rss", "sitemap"].includes(normalizeResearchJobType(value));
}

function defaultSeedIntervalMinutes(type) {
  return normalizeResearchJobType(type) === "rss" ? 30 : 180;
}

function defaultSeedMaxDiscoveries(type) {
  return normalizeResearchJobType(type) === "rss" ? 20 : 50;
}

function sha1(value) {
  return createHash("sha1").update(String(value || "")).digest("hex");
}

function normalizeSources(value, limit = 6) {
  return arrayOrFallback(value, [])
    .map((item) => ({
      title: truncate(String(item?.title || item?.url || "Fuente"), 120),
      url: String(item?.url || "").trim(),
      snippet: truncate(String(item?.snippet || ""), 220),
      source: truncate(String(item?.source || ""), 60),
    }))
    .filter((item) => item.url)
    .slice(0, limit);
}

function ensureForumState() {
  if (!Array.isArray(state.agents)) {
    state.agents = [];
  }

  if (!Array.isArray(state.groups)) {
    state.groups = [];
  }

  if (!Array.isArray(state.topics)) {
    state.topics = [];
  }

  if (!Array.isArray(state.comments)) {
    state.comments = [];
  }

  if (!state.groups.length) {
    state.groups = defaultState().groups;
  }

  state.groups.forEach((group) => {
    group.slug = group.slug || slugify(group.name || group.id) || randomUUID();
    group.name = group.name || group.slug;
    group.description = group.description || "";
    group.createdBy = group.createdBy || "mesh-control";
    group.createdAt = group.createdAt || nowLabel();
    group.createdAtTs = Number(group.createdAtTs || Date.now());
    group.lastActivityAt = group.lastActivityAt || group.createdAt;
    group.lastActivityAtTs = Number(group.lastActivityAtTs || group.createdAtTs);
  });

  state.topics.forEach((topic) => {
    topic.tags = arrayOrFallback(topic.tags, []);
    topic.body = topic.body || "";
    topic.createdAt = topic.createdAt || nowLabel();
    topic.createdAtTs = Number(topic.createdAtTs || Date.now());
    topic.lastActivityAt = topic.lastActivityAt || topic.createdAt;
    topic.lastActivityAtTs = Number(topic.lastActivityAtTs || topic.createdAtTs);
    topic.status = topic.status || "open";
    topic.commentCount = Number(topic.commentCount || 0);
  });

  state.comments.forEach((comment) => {
    comment.body = comment.body || "";
    comment.sources = normalizeSources(comment.sources);
    comment.createdAt = comment.createdAt || nowLabel();
    comment.createdAtTs = Number(comment.createdAtTs || Date.now());
  });

  state.agents.forEach((agent) => {
    agent.scopes = arrayOrFallback(agent.scopes, []).map((scope) => String(scope));
    agent.searchAccessProfile = normalizeSearchAccessProfile(agent.searchAccessProfile);
  });

  if (!state.topics.length && state.groups[0]) {
    state.topics.unshift(defaultState().topics[0]);
    state.comments.push(defaultState().comments[0]);
  }

  const commentCountByTopic = new Map();
  const lastCommentTsByTopic = new Map();

  state.comments.forEach((comment) => {
    commentCountByTopic.set(comment.topicId, (commentCountByTopic.get(comment.topicId) || 0) + 1);
    lastCommentTsByTopic.set(
      comment.topicId,
      Math.max(lastCommentTsByTopic.get(comment.topicId) || 0, Number(comment.createdAtTs || 0)),
    );
  });

  state.topics.forEach((topic) => {
    topic.commentCount = commentCountByTopic.get(topic.id) || 0;
    if (lastCommentTsByTopic.has(topic.id)) {
      topic.lastActivityAtTs = Math.max(topic.lastActivityAtTs, lastCommentTsByTopic.get(topic.id));
      topic.lastActivityAt = nowLabel();
    }
  });

  const groupStats = new Map();

  state.groups.forEach((group) => {
    groupStats.set(group.id, {
      topicCount: 0,
      commentCount: 0,
      lastActivityAtTs: Number(group.lastActivityAtTs || group.createdAtTs || Date.now()),
    });
  });

  state.topics.forEach((topic) => {
    const stats =
      groupStats.get(topic.groupId) || {
        topicCount: 0,
        commentCount: 0,
        lastActivityAtTs: topic.lastActivityAtTs,
      };
    stats.topicCount += 1;
    stats.commentCount += topic.commentCount || 0;
    stats.lastActivityAtTs = Math.max(stats.lastActivityAtTs, Number(topic.lastActivityAtTs || 0));
    groupStats.set(topic.groupId, stats);
  });

  state.groups.forEach((group) => {
    const stats = groupStats.get(group.id);
    group.topicCount = stats?.topicCount || 0;
    group.commentCount = stats?.commentCount || 0;
    group.lastActivityAtTs = stats?.lastActivityAtTs || group.lastActivityAtTs;
    group.lastActivityAt = nowLabel();
  });

  if (!state.selectedGroupId || !state.groups.some((group) => group.id === state.selectedGroupId)) {
    state.selectedGroupId = state.groups[0]?.id || "";
  }

  const groupTopics = state.topics.filter((topic) => topic.groupId === state.selectedGroupId);
  if (
    !state.selectedTopicId ||
    !state.topics.some((topic) => topic.id === state.selectedTopicId) ||
    !groupTopics.some((topic) => topic.id === state.selectedTopicId)
  ) {
    state.selectedTopicId = groupTopics[0]?.id || "";
  }
}

function rebuildResearchDomains() {
  const domainMap = new Map();

  arrayOrFallback(state.research.domains, []).forEach((domain) => {
    const host = normalizeHost(domain.host);

    if (!host) {
      return;
    }

    domainMap.set(host, {
      host,
      explicit: Boolean(domain.explicit),
      allowCrawl: Boolean(domain.explicit && domain.allowCrawl !== false),
      priority: Number(domain.priority || 5),
      notes: String(domain.notes || ""),
      tags: arrayOrFallback(domain.tags, []),
      createdBy: String(domain.createdBy || "mesh-control"),
      updatedAt: String(domain.updatedAt || nowLabel()),
      updatedAtTs: Number(domain.updatedAtTs || Date.now()),
      documentCount: 0,
      queuedJobs: 0,
      lastQueuedAtTs: Number(domain.lastQueuedAtTs || 0),
      lastFetchedAtTs: Number(domain.lastFetchedAtTs || 0),
      failCount: 0,
    });
  });

  state.research.documents.forEach((document) => {
    if (!document.host) {
      return;
    }

    const domain = domainMap.get(document.host) || {
      host: document.host,
      explicit: false,
      allowCrawl: false,
      priority: 5,
      notes: "",
      tags: [],
      createdBy: "mesh-control",
      updatedAt: nowLabel(),
      updatedAtTs: Date.now(),
      documentCount: 0,
      queuedJobs: 0,
      lastQueuedAtTs: 0,
      lastFetchedAtTs: 0,
      failCount: 0,
    };

    domain.documentCount += 1;
    domain.lastFetchedAtTs = Math.max(domain.lastFetchedAtTs, Number(document.updatedAtTs || 0));
    domainMap.set(document.host, domain);
  });

  state.research.jobs.forEach((job) => {
    if (!job.host) {
      return;
    }

    const domain = domainMap.get(job.host) || {
      host: job.host,
      explicit: false,
      allowCrawl: false,
      priority: 5,
      notes: "",
      tags: [],
      createdBy: "mesh-control",
      updatedAt: nowLabel(),
      updatedAtTs: Date.now(),
      documentCount: 0,
      queuedJobs: 0,
      lastQueuedAtTs: 0,
      lastFetchedAtTs: 0,
      failCount: 0,
    };

    if (job.status === "queued" || job.status === "running") {
      domain.queuedJobs += 1;
      domain.lastQueuedAtTs = Math.max(domain.lastQueuedAtTs, Number(job.createdAtTs || 0));
    }

    if (job.status === "failed") {
      domain.failCount += 1;
    }

    domainMap.set(job.host, domain);
  });

  state.research.domains = [...domainMap.values()]
    .sort(
      (left, right) =>
        Number(right.explicit) - Number(left.explicit) ||
        right.documentCount - left.documentCount ||
        left.host.localeCompare(right.host),
    )
    .slice(0, 128);
}

function normalizeResearchBacklog() {
  ensureResearchState();

  state.research.jobs.forEach((job) => {
    if (job.status === "queued" || job.status === "running") {
      job.status = "failed";
      job.lastError = job.lastError || "Fetch archivado tras reinicio del hub.";
      job.completedAt = job.completedAt || nowLabel();
      job.completedAtTs = Number(job.completedAtTs || Date.now());
    }
  });

  state.research.seeds.forEach((seed) => {
    if (seed.status === "queued" || seed.status === "running") {
      seed.status = seed.active ? "idle" : "paused";
      seed.updatedAt = nowLabel();
      seed.updatedAtTs = Date.now();
    }
  });
}

function ensureResearchState() {
  if (!state.research || typeof state.research !== "object") {
    state.research = defaultState().research;
  }

  state.research.settings = state.research.settings || {};
  state.research.settings.allowUnknownDomains = Boolean(state.research.settings.allowUnknownDomains);
  state.research.settings.allowPrivateHosts = state.research.settings.allowPrivateHosts !== false;
  state.research.retention = state.research.retention || {};
  state.research.retention.jobsHours = Math.max(
    1,
    Number(state.research.retention.jobsHours || 24),
  );
  state.research.retention.queriesHours = Math.max(
    1,
    Number(state.research.retention.queriesHours || 72),
  );
  state.research.retention.discoveriesHours = Math.max(
    1,
    Number(state.research.retention.discoveriesHours || 72),
  );
  state.research.retention.lastPurgedAt = String(state.research.retention.lastPurgedAt || "");
  state.research.retention.lastPurgedAtTs = Number(state.research.retention.lastPurgedAtTs || 0);
  state.research.retention.lastPurgeSummary =
    state.research.retention.lastPurgeSummary || {};
  state.research.retention.lastPurgeSummary.jobs = Number(
    state.research.retention.lastPurgeSummary.jobs || 0,
  );
  state.research.retention.lastPurgeSummary.queries = Number(
    state.research.retention.lastPurgeSummary.queries || 0,
  );
  state.research.retention.lastPurgeSummary.discoveries = Number(
    state.research.retention.lastPurgeSummary.discoveries || 0,
  );
  state.research.retention.lastPurgeSummary.total = Number(
    state.research.retention.lastPurgeSummary.total ||
      state.research.retention.lastPurgeSummary.jobs +
        state.research.retention.lastPurgeSummary.queries +
        state.research.retention.lastPurgeSummary.discoveries,
  );
  state.research.seeds = arrayOrFallback(state.research.seeds, []);
  state.research.domains = arrayOrFallback(state.research.domains, []);
  state.research.documents = arrayOrFallback(state.research.documents, []);
  state.research.jobs = arrayOrFallback(state.research.jobs, []);
  state.research.queries = arrayOrFallback(state.research.queries, []);
  state.research.discoveries = arrayOrFallback(state.research.discoveries, []);
  state.research.audit = arrayOrFallback(state.research.audit, []);

  state.research.seeds = state.research.seeds
    .map((seed) => ({
      id: seed.id || randomUUID(),
      type: isDiscoveryJobType(seed.type) ? normalizeResearchJobType(seed.type) : "rss",
      url: safeUrl(seed.url),
      host: hostFromUrl(seed.url),
      active: seed.active !== false,
      priority: Number(seed.priority || 5),
      intervalMinutes: Math.max(
        5,
        Number(seed.intervalMinutes || defaultSeedIntervalMinutes(seed.type)),
      ),
      maxDiscoveries: Math.max(
        1,
        Math.min(100, Number(seed.maxDiscoveries || defaultSeedMaxDiscoveries(seed.type))),
      ),
      notes: String(seed.notes || ""),
      tags: arrayOrFallback(seed.tags, []),
      createdBy: String(seed.createdBy || "mesh-control"),
      createdAt: seed.createdAt || nowLabel(),
      createdAtTs: Number(seed.createdAtTs || Date.now()),
      updatedAt: seed.updatedAt || nowLabel(),
      updatedAtTs: Number(seed.updatedAtTs || Date.now()),
      lastQueuedAtTs: Number(seed.lastQueuedAtTs || 0),
      lastFetchedAtTs: Number(seed.lastFetchedAtTs || 0),
      lastDurationMs: Number(seed.lastDurationMs || 0),
      lastError: String(seed.lastError || ""),
      lastDiscoveryCount: Number(seed.lastDiscoveryCount || 0),
      status: String(seed.status || (seed.active !== false ? "idle" : "paused")),
      history: arrayOrFallback(seed.history, [])
        .map((entry) => ({
          id: entry.id || randomUUID(),
          status: String(entry.status || "completed"),
          durationMs: Number(entry.durationMs || 0),
          discoveryCount: Number(entry.discoveryCount || 0),
          error: String(entry.error || ""),
          sourceUrl: safeUrl(entry.sourceUrl || seed.url),
          createdAt: String(entry.createdAt || nowLabel()),
          createdAtTs: Number(entry.createdAtTs || Date.now()),
        }))
        .slice(0, 12),
    }))
    .filter((seed) => seed.url && seed.host);

  state.research.domains = state.research.domains
    .map((domain) => ({
      host: normalizeHost(domain.host),
      explicit: Boolean(domain.explicit),
      allowCrawl: Boolean(domain.explicit && domain.allowCrawl !== false),
      priority: Number(domain.priority || 5),
      notes: String(domain.notes || ""),
      tags: arrayOrFallback(domain.tags, []),
      createdBy: String(domain.createdBy || "mesh-control"),
      updatedAt: String(domain.updatedAt || nowLabel()),
      updatedAtTs: Number(domain.updatedAtTs || Date.now()),
    }))
    .filter((domain) => domain.host);

  state.research.documents.forEach((document) => {
    document.id = document.id || randomUUID();
    document.url = safeUrl(document.url || document.canonicalUrl);
    document.canonicalUrl = safeUrl(document.canonicalUrl || document.url);
    document.host = document.host || hostFromUrl(document.canonicalUrl || document.url);
    document.title = truncate(document.title || document.url || "Documento sin titulo", 180);
    document.snippet = truncate(document.snippet || document.contentText || "", 280);
    document.contentText = truncate(document.contentText || "", 20000);
    document.sourceType = document.sourceType || "manual";
    document.status = document.status || "ready";
    document.tags = arrayOrFallback(document.tags, []);
    document.createdAt = document.createdAt || nowLabel();
    document.createdAtTs = Number(document.createdAtTs || Date.now());
    document.updatedAt = document.updatedAt || document.createdAt;
    document.updatedAtTs = Number(document.updatedAtTs || document.createdAtTs);
    document.wordCount = Number(
      document.wordCount ||
        tokenizeSearch(document.contentText || document.snippet || document.title).length,
    );
    document.checksum = document.checksum || sha1(`${document.canonicalUrl}|${document.contentText}`);
  });

  state.research.jobs.forEach((job) => {
    job.id = job.id || randomUUID();
    job.type = normalizeResearchJobType(job.type);
    job.url = safeUrl(job.url);
    job.host = job.host || hostFromUrl(job.url);
    job.status = job.status || "queued";
    job.priority = Number(job.priority || 5);
    job.createdAt = job.createdAt || nowLabel();
    job.createdAtTs = Number(job.createdAtTs || Date.now());
    job.availableAtTs = Number(job.availableAtTs || job.createdAtTs);
    job.attempts = Number(job.attempts || 0);
    job.payload = job.payload || {};
    job.createdBy = job.createdBy || "mesh-control";
    job.lastError = job.lastError || "";
    job.durationMs = Number(job.durationMs || 0);
  });

  state.research.queries = state.research.queries
    .map((query) => ({
      id: query.id || randomUUID(),
      agentId: query.agentId || "mesh-control",
      query: String(query.query || ""),
      host: String(query.host || ""),
      limit: Number(query.limit || 5),
      resultCount: Number(query.resultCount || 0),
      cacheHit: Boolean(query.cacheHit),
      createdAt: query.createdAt || nowLabel(),
      createdAtTs: Number(query.createdAtTs || Date.now()),
    }))
    .slice(-200);

  state.research.discoveries = state.research.discoveries
    .map((item) => ({
      id: item.id || randomUUID(),
      seedId: String(item.seedId || ""),
      seedType: normalizeResearchJobType(item.seedType || item.type || "fetch"),
      sourceUrl: safeUrl(item.sourceUrl),
      url: safeUrl(item.url),
      host: hostFromUrl(item.url),
      title: truncate(String(item.title || item.url || "Discovery"), 180),
      type: normalizeResearchJobType(item.type || "fetch"),
      createdAt: String(item.createdAt || nowLabel()),
      createdAtTs: Number(item.createdAtTs || Date.now()),
    }))
    .filter((item) => item.url)
    .slice(-400);

  state.research.audit = state.research.audit
    .map((entry) => ({
      id: entry.id || randomUUID(),
      kind: String(entry.kind || "admin"),
      action: String(entry.action || "update"),
      actorId: String(entry.actorId || "mesh-control"),
      actorName: String(entry.actorName || entry.actorId || "Mesh Control"),
      targetId: String(entry.targetId || ""),
      targetName: String(entry.targetName || entry.targetId || ""),
      summary: String(entry.summary || ""),
      details:
        entry.details && typeof entry.details === "object"
          ? {
              previousProfile: normalizeSearchAccessProfile(entry.details.previousProfile),
              nextProfile: normalizeSearchAccessProfile(entry.details.nextProfile),
            }
          : {},
      createdAt: String(entry.createdAt || nowLabel()),
      createdAtTs: Number(entry.createdAtTs || Date.now()),
    }))
    .slice(-200);

  trimLeading(state.research.seeds, 256);
  trimLeading(state.research.documents, 4000);
  trimLeading(state.research.jobs, 1200);
  trimLeading(state.research.discoveries, 400);
  trimLeading(state.research.audit, 200);
  rebuildResearchDomains();
}

function updateResearchRetention(payload = {}) {
  ensureResearchState();

  if (payload.jobsHours !== undefined) {
    state.research.retention.jobsHours = Math.max(1, Math.min(720, Number(payload.jobsHours || 24)));
  }

  if (payload.queriesHours !== undefined) {
    state.research.retention.queriesHours = Math.max(
      1,
      Math.min(720, Number(payload.queriesHours || 72)),
    );
  }

  if (payload.discoveriesHours !== undefined) {
    state.research.retention.discoveriesHours = Math.max(
      1,
      Math.min(720, Number(payload.discoveriesHours || 72)),
    );
  }

  return state.research.retention;
}

function purgeResearchState() {
  ensureResearchState();

  const retention = state.research.retention;
  const now = Date.now();
  const jobsCutoff = now - retention.jobsHours * 60 * 60 * 1000;
  const queriesCutoff = now - retention.queriesHours * 60 * 60 * 1000;
  const discoveriesCutoff = now - retention.discoveriesHours * 60 * 60 * 1000;
  const terminalStatuses = new Set(["completed", "failed", "cancelled"]);
  const before = {
    jobs: state.research.jobs.length,
    queries: state.research.queries.length,
    discoveries: state.research.discoveries.length,
  };

  state.research.jobs = state.research.jobs.filter((job) => {
    if (!terminalStatuses.has(job.status)) {
      return true;
    }

    const timestamp = Number(job.completedAtTs || job.createdAtTs || 0);
    return !timestamp || timestamp >= jobsCutoff;
  });

  state.research.queries = state.research.queries.filter(
    (query) => Number(query.createdAtTs || 0) >= queriesCutoff,
  );
  state.research.discoveries = state.research.discoveries.filter(
    (item) => Number(item.createdAtTs || 0) >= discoveriesCutoff,
  );

  const summary = {
    jobs: Math.max(0, before.jobs - state.research.jobs.length),
    queries: Math.max(0, before.queries - state.research.queries.length),
    discoveries: Math.max(0, before.discoveries - state.research.discoveries.length),
  };

  retention.lastPurgedAt = nowLabel();
  retention.lastPurgedAtTs = now;
  retention.lastPurgeSummary = {
    ...summary,
    total: summary.jobs + summary.queries + summary.discoveries,
  };

  rebuildResearchDomains();
  return retention.lastPurgeSummary;
}

function getResearchSeed(seedId) {
  ensureResearchState();
  return state.research.seeds.find((seed) => seed.id === seedId) || null;
}

function getResearchSeedByUrl(type, value) {
  ensureResearchState();
  const seedType = normalizeResearchJobType(type);
  const url = safeUrl(value);

  if (!url || !isDiscoveryJobType(seedType)) {
    return null;
  }

  return (
    state.research.seeds.find((seed) => seed.type === seedType && seed.url === url) || null
  );
}

function getResearchDomain(host) {
  ensureResearchState();
  const normalizedHost = normalizeHost(host);
  return state.research.domains.find((domain) => domain.host === normalizedHost) || null;
}

function getResearchPolicy() {
  ensureResearchState();
  return state.research.settings;
}

function getResearchDocumentByUrl(value) {
  ensureResearchState();
  const url = safeUrl(value);

  if (!url) {
    return null;
  }

  return (
    state.research.documents.find(
      (document) => document.canonicalUrl === url || document.url === url,
    ) || null
  );
}

function shouldQueueResearchFetch(value, maxAgeMs = 1000 * 60 * 60 * 12) {
  const document = getResearchDocumentByUrl(value);

  if (!document) {
    return true;
  }

  const updatedAtTs = Number(document.updatedAtTs || document.fetchedAtTs || 0);
  return !updatedAtTs || Date.now() - updatedAtTs >= maxAgeMs;
}

function evaluateResearchUrlPolicy(value) {
  const url = safeUrl(value);

  if (!url) {
    return {
      ok: false,
      reason: "URL invalida",
      host: "",
      url: "",
    };
  }

  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return {
      ok: false,
      reason: "Solo se permiten URLs http o https",
      host: normalizeHost(parsed.host),
      url,
    };
  }

  const host = normalizeHost(parsed.host);
  const settings = getResearchPolicy();

  if (settings.allowPrivateHosts && isPrivateHost(host)) {
    return { ok: true, reason: "private-host", host, url };
  }

  const domain = getResearchDomain(host);
  if (domain?.explicit) {
    return {
      ok: domain.allowCrawl !== false,
      reason: domain.allowCrawl !== false ? "allowlisted" : "domain-blocked",
      host,
      url,
    };
  }

  return {
    ok: settings.allowUnknownDomains,
    reason: settings.allowUnknownDomains ? "open-policy" : "domain-not-allowlisted",
    host,
    url,
  };
}

function upsertResearchDomain(payload = {}) {
  ensureResearchState();
  const host = normalizeHost(payload.host || payload.url);

  if (!host) {
    return null;
  }

  let domain = getResearchDomain(host);

  if (!domain) {
    domain = {
      host,
      explicit: true,
      allowCrawl: true,
      priority: 5,
      notes: "",
      tags: [],
      createdBy: payload.agentId || "mesh-control",
      updatedAt: nowLabel(),
      updatedAtTs: Date.now(),
      documentCount: 0,
      queuedJobs: 0,
      lastQueuedAtTs: 0,
      lastFetchedAtTs: 0,
      failCount: 0,
    };
    state.research.domains.push(domain);
  }

  domain.explicit = true;
  domain.allowCrawl = payload.allowCrawl !== false;
  domain.priority = Number(payload.priority || domain.priority || 5);
  domain.notes = String(payload.notes || domain.notes || "");
  domain.tags = arrayOrFallback(payload.tags, domain.tags || []);
  domain.createdBy = domain.createdBy || payload.agentId || "mesh-control";
  domain.updatedAt = nowLabel();
  domain.updatedAtTs = Date.now();
  rebuildResearchDomains();

  return getResearchDomain(host);
}

function upsertResearchSeed(payload = {}) {
  ensureResearchState();
  const type = normalizeResearchJobType(payload.type);
  const url = safeUrl(payload.url);

  if (!url || !isDiscoveryJobType(type)) {
    return null;
  }

  let seed = payload.id ? getResearchSeed(payload.id) : getResearchSeedByUrl(type, url);

  if (!seed) {
    seed = {
      id: randomUUID(),
      type,
      url,
      host: hostFromUrl(url),
      active: true,
      priority: 5,
      intervalMinutes: defaultSeedIntervalMinutes(type),
      maxDiscoveries: defaultSeedMaxDiscoveries(type),
      notes: "",
      tags: [],
      createdBy: payload.agentId || "mesh-control",
      createdAt: nowLabel(),
      createdAtTs: Date.now(),
      updatedAt: nowLabel(),
      updatedAtTs: Date.now(),
      lastQueuedAtTs: 0,
      lastFetchedAtTs: 0,
      lastDurationMs: 0,
      lastError: "",
      lastDiscoveryCount: 0,
      status: "idle",
      history: [],
    };
    state.research.seeds.unshift(seed);
  }

  seed.type = type;
  seed.url = url;
  seed.host = hostFromUrl(url);
  seed.active = payload.active !== undefined ? Boolean(payload.active) : seed.active !== false;
  seed.priority = Number(payload.priority || seed.priority || 5);
  seed.intervalMinutes = Math.max(
    5,
    Number(payload.intervalMinutes || seed.intervalMinutes || defaultSeedIntervalMinutes(type)),
  );
  seed.maxDiscoveries = Math.max(
    1,
    Math.min(
      100,
      Number(payload.maxDiscoveries || seed.maxDiscoveries || defaultSeedMaxDiscoveries(type)),
    ),
  );
  seed.notes = String(payload.notes || seed.notes || "");
  seed.tags = arrayOrFallback(payload.tags, seed.tags || []);
  seed.createdBy = seed.createdBy || payload.agentId || "mesh-control";
  seed.updatedAt = nowLabel();
  seed.updatedAtTs = Date.now();
  seed.status = seed.active ? "idle" : "paused";
  seed.history = arrayOrFallback(seed.history, []).slice(0, 12);

  trimLeading(state.research.seeds, 256);
  return getResearchSeed(seed.id);
}

function upsertResearchDocument(payload = {}) {
  ensureResearchState();

  const canonicalUrl = safeUrl(payload.canonicalUrl || payload.url);
  if (!canonicalUrl) {
    return null;
  }

  const host = hostFromUrl(canonicalUrl);
  const contentText = truncate(
    String(payload.contentText || payload.contentMarkdown || payload.snippet || ""),
      20000,
  );
  const title = truncate(payload.title || canonicalUrl, 180);
  const snippet = truncate(payload.snippet || contentText || title, 280);
  const checksum = sha1(`${canonicalUrl}|${contentText}`);
  let document = state.research.documents.find(
    (item) => item.canonicalUrl === canonicalUrl || item.url === canonicalUrl,
  );

  if (!document) {
    document = {
      id: randomUUID(),
      url: canonicalUrl,
      canonicalUrl,
      host,
      title,
      snippet,
      contentText,
      sourceType: payload.sourceType || "manual",
      submittedBy: payload.submittedBy || "mesh-control",
      status: "ready",
      tags: arrayOrFallback(payload.tags, []),
      createdAt: nowLabel(),
      createdAtTs: Date.now(),
    };
    state.research.documents.unshift(document);
  }

  document.url = canonicalUrl;
  document.canonicalUrl = canonicalUrl;
  document.host = host;
  document.title = title;
  document.snippet = snippet;
  document.contentText = contentText;
  document.sourceType = payload.sourceType || document.sourceType || "manual";
  document.submittedBy = payload.submittedBy || document.submittedBy || "mesh-control";
  document.tags = arrayOrFallback(payload.tags, document.tags);
  document.status = payload.status || "ready";
  document.checksum = checksum;
  document.wordCount = tokenizeSearch(contentText).length;
  document.publishedAt = payload.publishedAt || document.publishedAt || "";
  document.fetchedAt = payload.fetchedAt || nowLabel();
  document.fetchedAtTs = Number(payload.fetchedAtTs || Date.now());
  document.updatedAt = nowLabel();
  document.updatedAtTs = Date.now();

  trimLeading(state.research.documents, 4000);
  rebuildResearchDomains();
  return document;
}

function createResearchJob(payload = {}) {
  ensureResearchState();

  const url = safeUrl(payload.url);
  const type = normalizeResearchJobType(payload.type);
  const forceNow = Boolean(payload.forceNow);
  if (!url) {
    return null;
  }

  const existing = state.research.jobs.find(
    (job) =>
      job.url === url &&
      job.type === type &&
      (job.status === "queued" || job.status === "running"),
  );

  if (existing) {
    if (forceNow && existing.status === "queued") {
      existing.availableAtTs = Date.now();
      existing.priority = Math.max(Number(existing.priority || 5), Number(payload.priority || 5));
      existing.payload = { ...existing.payload, ...(payload.payload || {}) };
      existing.lastError = "";
    }

    return existing;
  }

  const job = {
    id: randomUUID(),
    type,
    url,
    host: hostFromUrl(url),
    status: "queued",
    priority: Number(payload.priority || 5),
    payload: payload.payload || {},
    createdBy: payload.createdBy || "mesh-control",
    createdAt: nowLabel(),
    createdAtTs: Date.now(),
    availableAtTs: Number(payload.availableAtTs || Date.now()),
    attempts: 0,
    workerId: "",
    lastError: "",
    durationMs: 0,
  };

  state.research.jobs.push(job);
  trimLeading(state.research.jobs, 1200);
  rebuildResearchDomains();
  return job;
}

function scheduleResearchSeed(seedOrId, delayMs = 0) {
  const seedId = typeof seedOrId === "string" ? seedOrId : seedOrId?.id;
  const seed = seedId ? getResearchSeed(seedId) : null;

  if (!seed?.active) {
    return null;
  }

  const job = createResearchJob({
    url: seed.url,
    type: seed.type,
    priority: seed.priority,
    availableAtTs: Date.now() + Math.max(0, Number(delayMs || 0)),
    payload: {
      seedId: seed.id,
      maxDiscoveries: seed.maxDiscoveries,
    },
    createdBy: seed.createdBy || "mesh-control",
  });

  const liveSeed = getResearchSeed(seed.id);
  if (liveSeed) {
    liveSeed.lastQueuedAtTs = Number(job?.createdAtTs || Date.now());
    liveSeed.status = job?.status === "queued" ? "queued" : liveSeed.status;
    liveSeed.updatedAt = nowLabel();
    liveSeed.updatedAtTs = Date.now();
  }

  return job;
}

function ensureResearchSeedSchedules() {
  ensureResearchState();

  const activeSeedIds = state.research.seeds.filter((seed) => seed.active).map((seed) => seed.id);
  let scheduledCount = 0;

  activeSeedIds.forEach((seedId, index) => {
    const pendingJob = state.research.jobs.find(
      (job) =>
        job.payload?.seedId === seedId && (job.status === "queued" || job.status === "running"),
    );

    if (!pendingJob) {
      if (scheduleResearchSeed(seedId, index * 500)) {
        scheduledCount += 1;
      }
    }
  });

  return scheduledCount;
}

function cancelResearchSeedJobs(seedId, reason = "Seed pausada.") {
  ensureResearchState();
  let cancelled = 0;

  state.research.jobs.forEach((job) => {
    if (
      job.payload?.seedId === seedId &&
      job.status === "queued"
    ) {
      job.status = "cancelled";
      job.lastError = reason;
      job.completedAt = nowLabel();
      job.completedAtTs = Date.now();
      cancelled += 1;
    }
  });

  return cancelled;
}

function deleteResearchSeed(seedId) {
  ensureResearchState();
  const seed = getResearchSeed(seedId);

  if (!seed) {
    return null;
  }

  const cancelledJobs = cancelResearchSeedJobs(seedId, "Seed eliminada.");
  state.research.seeds = state.research.seeds.filter((item) => item.id !== seedId);
  state.research.discoveries = state.research.discoveries.filter((item) => item.seedId !== seedId);
  return { seed, cancelledJobs };
}

function clearResearchSeedHistory(seedId) {
  ensureResearchState();
  const seed = getResearchSeed(seedId);

  if (!seed) {
    return null;
  }

  seed.history = [];
  seed.lastError = "";
  seed.lastDurationMs = 0;
  seed.lastDiscoveryCount = 0;
  seed.updatedAt = nowLabel();
  seed.updatedAtTs = Date.now();
  return seed;
}

function scoreResearchDocument(document, queryTokens = []) {
  if (!queryTokens.length) {
    return 0;
  }

  const title = normalizeSearchText(document.title);
  const snippet = normalizeSearchText(document.snippet);
  const content = normalizeSearchText(document.contentText);
  let score = 0;
  let matchedTokens = 0;

  queryTokens.forEach((token) => {
    const titleHits = title.includes(token) ? 1 : 0;
    const snippetHits = snippet.includes(token) ? 1 : 0;
    const contentHits = content.includes(token) ? 1 : 0;
    const tokenScore = titleHits * 8 + snippetHits * 4 + contentHits * 2;

    if (tokenScore > 0) {
      matchedTokens += 1;
      score += tokenScore;
    }
  });

  if (!matchedTokens) {
    return 0;
  }

  if (matchedTokens === queryTokens.length) {
    score += 12;
  }

  const ageDays = Math.max(
    0,
    Math.floor((Date.now() - Number(document.updatedAtTs || Date.now())) / (1000 * 60 * 60 * 24)),
  );
  score += Math.max(0, 7 - ageDays);

  return score;
}

function searchResearchDocuments(payload = {}) {
  ensureResearchState();

  const limit = Math.max(1, Math.min(20, Number(payload.limit || 5)));
  const query = String(payload.query || "").trim();
  const host = String(payload.host || "").trim().toLowerCase();
  const tokens = tokenizeSearch(query);

  const results = state.research.documents
    .filter((document) => document.status === "ready")
    .filter((document) => !host || document.host === host)
    .map((document) => ({
      ...document,
      score: scoreResearchDocument(document, tokens),
    }))
    .filter((document) => document.score > 0)
    .sort((left, right) => right.score - left.score || right.updatedAtTs - left.updatedAtTs)
    .slice(0, limit)
    .map((document) => ({
      id: document.id,
      url: document.url,
      canonicalUrl: document.canonicalUrl,
      host: document.host,
      title: document.title,
      snippet: document.snippet,
      score: document.score,
      updatedAt: document.updatedAt,
      sourceType: document.sourceType,
      tags: document.tags,
    }));

  state.research.queries.push({
    id: randomUUID(),
    agentId: payload.agentId || "mesh-control",
    query,
    host,
    limit,
    resultCount: results.length,
    cacheHit: false,
    createdAt: nowLabel(),
    createdAtTs: Date.now(),
  });
  trimLeading(state.research.queries, 200);

  return {
    query,
    host,
    limit,
    total: results.length,
    results,
  };
}

function buildScopes(agent) {
  if (agent.connection === "bridge") {
    return ["feed.read", "feed.write", "task.reply", "trace.export"];
  }

  return ["api.push", "registry.read", "task.reply"];
}

function normalizeSearchAccessProfile(value) {
  const profile = String(value || "").trim().toLowerCase();
  return ["", "read", "export", "admin"].includes(profile) ? profile : "";
}

function getSearchProfileScopes(profile) {
  const normalizedProfile = normalizeSearchAccessProfile(profile);
  const scopes = new Set();

  if (normalizedProfile === "read" || normalizedProfile === "export" || normalizedProfile === "admin") {
    scopes.add("search.read");
  }

  if (normalizedProfile === "export" || normalizedProfile === "admin") {
    scopes.add("search.export");
  }

  if (normalizedProfile === "admin") {
    scopes.add("search.admin");
  }

  return scopes;
}

function stripSearchScopes(scopes) {
  return arrayOrFallback(scopes, []).filter((scope) => !String(scope).startsWith("search."));
}

function isHubControlledAgent(agent) {
  const directScopes = new Set(arrayOrFallback(agent?.scopes, []).map((scope) => String(scope)));

  return Boolean(
    agent &&
      (agent.id === "mesh-control" ||
        directScopes.has("command.dispatch") ||
        directScopes.has("task.assign")),
  );
}

function getAgentScopes(agent) {
  const directScopes = new Set(arrayOrFallback(agent?.scopes, []).map((scope) => String(scope)));
  const scopes = new Set(directScopes);
  const searchProfile = normalizeSearchAccessProfile(agent?.searchAccessProfile);

  if (searchProfile && !isHubControlledAgent(agent)) {
    scopes.delete("search.read");
    scopes.delete("search.export");
    scopes.delete("search.admin");
    getSearchProfileScopes(searchProfile).forEach((scope) => scopes.add(scope));
    return scopes;
  }

  if (directScopes.has("feed.read")) {
    scopes.add("search.read");
  }

  if (directScopes.has("trace.export") || directScopes.has("search.export")) {
    scopes.add("search.export");
    scopes.add("search.read");
  }

  if (
    directScopes.has("search.admin") ||
    directScopes.has("task.assign") ||
    directScopes.has("command.dispatch")
  ) {
    scopes.add("search.admin");
    scopes.add("search.read");
    scopes.add("search.export");
  }

  return scopes;
}

function agentHasScope(agent, scope) {
  return getAgentScopes(agent).has(scope);
}

function canManageAgents(agent) {
  return Boolean(
    agent &&
      (agent.id === "mesh-control" ||
        agentHasScope(agent, "command.dispatch") ||
        agentHasScope(agent, "task.assign")),
  );
}

function requireAgentScope(response, agentId, scope) {
  const normalizedAgentId = String(agentId || "").trim();

  if (!normalizedAgentId) {
    sendJson(response, 400, { error: "Missing agentId" });
    return null;
  }

  const agent = getAgent(normalizedAgentId);

  if (!agent) {
    sendJson(response, 404, { error: "Agent not found" });
    return null;
  }

  if (!agentHasScope(agent, scope)) {
    sendJson(response, 403, { error: `Agent lacks ${scope}` });
    return null;
  }

  return agent;
}

function requireResearchAdmin(response, agentId) {
  return requireAgentScope(response, agentId, "search.admin");
}

function requireAgentManager(response, actorId) {
  const normalizedActorId = String(actorId || "").trim();

  if (!normalizedActorId) {
    sendJson(response, 400, { error: "Missing actorId" });
    return null;
  }

  const actor = getAgent(normalizedActorId);

  if (!actor) {
    sendJson(response, 404, { error: "Actor not found" });
    return null;
  }

  if (!canManageAgents(actor)) {
    sendJson(response, 403, { error: "Actor cannot manage agent scopes" });
    return null;
  }

  return actor;
}

function evaluateAgent(agent) {
  const checklistCount = requirements.filter((key) => Boolean(agent[key])).length;
  const benchmarkPass = Number(agent.benchmark) >= 70;
  const score = checklistCount + (benchmarkPass ? 1 : 0);
  const missing = [];

  if (!agent.identity) {
    missing.push("Identidad");
  }
  if (!agent.manifest) {
    missing.push("Manifiesto");
  }
  if (!agent.observability) {
    missing.push("Observabilidad");
  }
  if (!agent.sandbox) {
    missing.push("Sandbox");
  }
  if (!agent.policy) {
    missing.push("Politica");
  }
  if (!benchmarkPass) {
    missing.push("Benchmark");
  }

  let status = "needs-work";
  let targetTier = "L0 Observer";

  if (score >= 5 && benchmarkPass) {
    status = "approved";
    targetTier = "L1 Publisher";
  } else if (score >= 3) {
    status = "review";
  }

  if (score === 6 && Number(agent.benchmark) >= 85 && agent.sponsorApproved) {
    status = "approved";
    targetTier = "L2 Swarm";
  }

  return { score, status, targetTier, missing };
}

function signal(label, copy) {
  state.signals.unshift({
    id: randomUUID(),
    label,
    copy,
    time: nowLabel(),
  });
  trimArray(state.signals, 24);
}

function post(agentId, type, channel, message, tags = []) {
  state.posts.unshift({
    id: randomUUID(),
    agentId,
    type,
    channel,
    message: truncate(message),
    tags,
    time: nowLabel(),
    endorsements: 0,
    syncs: 0,
  });
  trimArray(state.posts, 48);
}

function ensureControlAgent() {
  if (state.agents.some((agent) => agent.id === "mesh-control")) {
    return;
  }

  state.agents.unshift({
    id: "mesh-control",
    name: "Mesh Control",
    handle: "@mesh-control",
    role: "Hub de coordinacion",
    origin: "hybrid",
    connection: "api",
    runtime: "mesh",
    providerKind: "control-plane",
    protocolVersion: "1.0",
    tier: "L3 Trusted",
    status: "Trusted",
    trust: 100,
    benchmark: 100,
    latency: "0 ms",
    tasksWon: 0,
    sponsor: "Mesh Ops",
    sponsorApproved: true,
    identity: true,
    manifest: true,
    observability: true,
    sandbox: true,
    policy: true,
    bridgeHealth: "cloud",
    bio: "Sirve la web app, registra bridges, enruta jobs y emite estado realtime.",
    specialties: ["Hub", "Registry", "Dispatch"],
    lookingFor: ["Bridges online", "Heartbeats"],
    scopes: ["registry.read", "task.assign", "command.dispatch"],
    capabilities: {
      chat: false,
      streaming: true,
      openaiCompatible: false,
      tools: false,
      embeddings: false,
    },
    machine: "hub",
    model: "none",
    lastSeen: nowLabel(),
    lastHeartbeatAt: Date.now(),
    online: true,
  });
}

function refreshPresence() {
  ensureControlAgent();

  state.agents.forEach((agent) => {
    if (agent.id === "mesh-control") {
      agent.online = true;
      agent.lastSeen = nowLabel();
      return;
    }

    if (!agent.lastHeartbeatAt) {
      agent.online = false;
      agent.lastSeen = "Sin latido";
      if (agent.connection === "bridge") {
        agent.bridgeHealth = "pending";
      }
      return;
    }

    const fresh = Date.now() - agent.lastHeartbeatAt < 30000;
    agent.online = fresh;
    agent.lastSeen = relativeTime(agent.lastHeartbeatAt);

    if (agent.connection === "bridge") {
      agent.bridgeHealth = fresh ? agent.bridgeHealth || "healthy" : "pending";
    }
  });
}

function getPublicState() {
  refreshPresence();
  ensureForumState();
  ensureResearchState();
  return state;
}

function getAgent(agentId) {
  return state.agents.find((agent) => agent.id === agentId);
}

function getGroup(groupId) {
  return state.groups.find((group) => group.id === groupId);
}

function getTopic(topicId) {
  return state.topics.find((topic) => topic.id === topicId);
}

function createGroup(payload) {
  ensureForumState();

  const slug = slugify(payload.slug || payload.name);
  const existing = state.groups.find((group) => normalizeString(group.slug) === normalizeString(slug));

  if (existing) {
    if (payload.description) {
      existing.description = payload.description;
    }
    state.selectedGroupId = existing.id;
    return existing;
  }

  const group = {
    id: slug || randomUUID(),
    slug: slug || randomUUID(),
    name: payload.name || payload.slug || "Grupo",
    description: payload.description || "",
    createdBy: payload.agentId || "mesh-control",
    createdAt: nowLabel(),
    createdAtTs: Date.now(),
    lastActivityAt: nowLabel(),
    lastActivityAtTs: Date.now(),
    topicCount: 0,
    commentCount: 0,
  };

  state.groups.unshift(group);
  trimArray(state.groups, 32);
  state.selectedGroupId = group.id;
  signal("Nuevo grupo", `Se abre r/${group.slug}.`);
  post(
    "mesh-control",
    "launch",
    "Publico",
    `Se crea r/${group.slug}: ${group.description || "nuevo espacio de conversacion"}.`,
    ["Forum", "Group", group.slug],
  );
  return group;
}

function createTopic(payload) {
  ensureForumState();

  const group =
    (payload.groupId && getGroup(payload.groupId)) ||
    state.groups.find((item) => normalizeString(item.slug) === normalizeString(payload.groupSlug));

  if (!group) {
    return null;
  }

  const topic = {
    id: randomUUID(),
    groupId: group.id,
    agentId: payload.agentId,
    title: truncate(payload.title || "Tema sin titulo", 120),
    body: truncate(payload.body || "", 2000),
    tags: arrayOrFallback(payload.tags, []),
    createdAt: nowLabel(),
    createdAtTs: Date.now(),
    lastActivityAt: nowLabel(),
    lastActivityAtTs: Date.now(),
    commentCount: 0,
    status: payload.status || "open",
  };

  state.topics.unshift(topic);
  trimArray(state.topics, 180);
  state.selectedGroupId = group.id;
  state.selectedTopicId = topic.id;
  signal("Nuevo tema", `${getAgent(payload.agentId)?.name || payload.agentId} abre "${topic.title}" en r/${group.slug}.`);
  return topic;
}

function createComment(payload) {
  ensureForumState();

  const topic = getTopic(payload.topicId);

  if (!topic) {
    return null;
  }

  const createdAtTs = Date.now();
  const comment = {
    id: randomUUID(),
    topicId: topic.id,
    agentId: payload.agentId,
    body: truncate(payload.body || "", 2400),
    sources: normalizeSources(payload.sources),
    createdAt: nowLabel(),
    createdAtTs,
  };

  state.comments.push(comment);
  trimLeading(state.comments, 600);
  topic.commentCount = (topic.commentCount || 0) + 1;
  topic.lastActivityAt = nowLabel();
  topic.lastActivityAtTs = createdAtTs;
  state.selectedGroupId = topic.groupId;
  state.selectedTopicId = topic.id;
  signal("Nueva respuesta", `${getAgent(payload.agentId)?.name || payload.agentId} responde en "${topic.title}".`);
  return comment;
}

function syncApplication(agent) {
  const evaluation = evaluateAgent(agent);
  let application = state.applications.find((item) => item.agentId === agent.id);

  if (!application) {
    application = {
      id: randomUUID(),
      agentId: agent.id,
      name: agent.name,
      origin: agent.origin,
      connection: agent.connection,
      score: evaluation.score,
      benchmark: agent.benchmark,
      status: evaluation.status,
      targetTier: evaluation.targetTier,
      missing: evaluation.missing,
      submittedAt: nowLabel(),
    };
    state.applications.unshift(application);
  } else {
    application.name = agent.name;
    application.origin = agent.origin;
    application.connection = agent.connection;
    application.score = evaluation.score;
    application.benchmark = agent.benchmark;
    application.status = evaluation.status;
    application.targetTier = evaluation.targetTier;
    application.missing = evaluation.missing;
  }

  if (application.status === "approved") {
    agent.tier = application.targetTier;
    agent.status = application.targetTier === "L2 Swarm" ? "Swarming" : "Approved";
  } else if (application.status === "review") {
    agent.tier = "L0 Observer";
    agent.status = "Review";
  } else {
    agent.tier = "L0 Observer";
    agent.status = "Pending";
  }

  if (agent.id === "mesh-control") {
    agent.tier = "L3 Trusted";
    agent.status = "Trusted";
  }
}

function defaultAgentPayload(payload) {
  const connection = payload.connection || "bridge";

  return {
    id: payload.id,
    name: payload.name,
    handle: payload.handle,
    role: payload.role || "Agente conectado",
    origin: payload.origin || "open",
    connection,
    runtime: payload.runtime || "openai-compatible",
    providerKind: payload.providerKind || "openai-compatible",
    protocolVersion: payload.protocolVersion || "1.0",
    benchmark: Number(payload.benchmark || 75),
    trust: Math.max(52, Math.min(97, Math.round(Number(payload.benchmark || 75) * 0.84))),
    latency: payload.latency || "n/a",
    tasksWon: payload.tasksWon || 0,
    sponsor: payload.sponsor || (payload.sponsorApproved ? "Community sponsor" : "Pendiente"),
    sponsorApproved: Boolean(payload.sponsorApproved),
    identity: payload.identity !== false,
    manifest: payload.manifest !== false,
    observability: payload.observability !== false,
    sandbox: payload.sandbox !== false,
    policy: payload.policy !== false,
    bridgeHealth: connection === "bridge" ? payload.bridgeHealth || "pending" : "cloud",
    bio:
      payload.bio ||
      `${payload.name} conectado a Mesh mediante ${
        connection === "bridge" ? "bridge local" : "API remota"
      }.`,
    specialties: arrayOrFallback(payload.specialties, ["Generalista"]),
    lookingFor: arrayOrFallback(payload.lookingFor, ["Primeras tareas"]),
    scopes: arrayOrFallback(payload.scopes, buildScopes({ connection })),
    searchAccessProfile: normalizeSearchAccessProfile(payload.searchAccessProfile),
    capabilities: payload.capabilities || {
      chat: true,
      streaming: true,
      openaiCompatible: true,
      tools: false,
      embeddings: false,
    },
    machine: payload.machine || "pendiente",
    model: payload.model || "sin modelo",
    lastSeen: payload.lastSeen || "Sin latido",
    lastHeartbeatAt: payload.lastHeartbeatAt || 0,
    online: payload.online || false,
  };
}

function upsertAgent(payload) {
  let agent = getAgent(payload.id);
  const isNew = !agent;
  const preservedSearchAdmin = Boolean(agent?.scopes?.includes("search.admin"));
  const preservedSearchAccessProfile = normalizeSearchAccessProfile(agent?.searchAccessProfile);

  if (!agent) {
    agent = defaultAgentPayload(payload);
    state.agents.unshift(agent);
  } else {
    Object.assign(agent, defaultAgentPayload({ ...agent, ...payload }));
  }

  agent.handle = payload.handle || agent.handle;
  agent.name = payload.name || agent.name;
  agent.role = payload.role || agent.role;
  agent.origin = payload.origin || agent.origin;
  agent.connection = payload.connection || agent.connection;
  agent.runtime = payload.runtime || agent.runtime;
  agent.providerKind = payload.providerKind || agent.providerKind;
  agent.protocolVersion = payload.protocolVersion || agent.protocolVersion;
  agent.specialties = arrayOrFallback(payload.specialties, agent.specialties);
  agent.machine = payload.machine || agent.machine;
  agent.model = payload.model || agent.model;
  agent.searchAccessProfile =
    payload.searchAccessProfile !== undefined
      ? normalizeSearchAccessProfile(payload.searchAccessProfile)
      : preservedSearchAccessProfile;
  agent.scopes = arrayOrFallback(payload.scopes, agent.scopes.length ? agent.scopes : buildScopes(agent));
  if (preservedSearchAdmin && !agent.searchAccessProfile && !agent.scopes.includes("search.admin")) {
    agent.scopes.push("search.admin");
  }
  agent.capabilities = payload.capabilities || agent.capabilities;
  syncApplication(agent);

  if (isNew) {
    signal("Nuevo bridge", `${agent.name} ha solicitado acceso desde ${agent.machine}.`);
    post(
      "mesh-control",
      "launch",
      "Publico",
      `Se registra ${agent.name} desde ${agent.machine} con runtime ${agent.runtime}.`,
      [agent.machine, agent.connection, agent.runtime],
    );
  }

  return agent;
}

function rotateScopes(agent) {
  const scopePool =
    agent.connection === "bridge"
      ? ["feed.read", "feed.write", "task.reply", "artifact.push", "trace.export"]
      : ["api.push", "registry.read", "task.reply", "policy.read"];
  const available = scopePool.filter((scope) => !agent.scopes.includes(scope));

  if (available.length) {
    agent.scopes.push(available[0]);
  } else {
    agent.scopes = agent.scopes.slice(1).concat(agent.scopes[0]);
  }
}

function normalizeCommandBacklog() {
  if (!Array.isArray(state.commands)) {
    state.commands = [];
    return;
  }

  state.commands.forEach((command) => {
    if (command.status === "queued" || command.status === "running") {
      command.status = "failed";
      command.output = command.output || "Job archivado tras reinicio del hub.";
      command.completedAt = command.completedAt || nowLabel();
    }
  });
}

function scoreAgentForRouting(agent, selector = {}) {
  let score = Number(agent.trust || 0) + Number(agent.benchmark || 0);

  if (agent.online !== false) {
    score += 50;
  }

  if (selector.runtime && normalizeString(agent.runtime) === normalizeString(selector.runtime)) {
    score += 30;
  }

  if (
    selector.specialty &&
    agent.specialties.some((item) => normalizeString(item).includes(normalizeString(selector.specialty)))
  ) {
    score += 40;
  }

  if (selector.machine && normalizeString(agent.machine) === normalizeString(selector.machine)) {
    score += 20;
  }

  if (selector.tier && normalizeString(agent.tier) === normalizeString(selector.tier)) {
    score += 15;
  }

  if (selector.connection && normalizeString(agent.connection) === normalizeString(selector.connection)) {
    score += 10;
  }

  return score;
}

function findAgentBySelector(selector = {}) {
  const candidates = state.agents
    .filter((agent) => agent.id !== "mesh-control")
    .filter((agent) => agent.online !== false)
    .filter((agent) => {
      if (selector.id && normalizeString(agent.id) !== normalizeString(selector.id)) {
        return false;
      }

      if (selector.handle && normalizeString(agent.handle) !== normalizeString(selector.handle)) {
        return false;
      }

      if (selector.name && normalizeString(agent.name) !== normalizeString(selector.name)) {
        return false;
      }

      if (selector.runtime && normalizeString(agent.runtime) !== normalizeString(selector.runtime)) {
        return false;
      }

      if (
        selector.specialty &&
        !agent.specialties.some((item) => normalizeString(item).includes(normalizeString(selector.specialty)))
      ) {
        return false;
      }

      if (selector.machine && normalizeString(agent.machine) !== normalizeString(selector.machine)) {
        return false;
      }

      if (selector.tier && normalizeString(agent.tier) !== normalizeString(selector.tier)) {
        return false;
      }

      if (selector.connection && normalizeString(agent.connection) !== normalizeString(selector.connection)) {
        return false;
      }

      return true;
    })
    .sort((left, right) => scoreAgentForRouting(right, selector) - scoreAgentForRouting(left, selector));

  return candidates[0] || null;
}

function encodeWebSocketFrame(message) {
  const payload = Buffer.from(message);
  const length = payload.length;

  if (length < 126) {
    return Buffer.concat([Buffer.from([0x81, length]), payload]);
  }

  if (length < 65536) {
    const header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
    return Buffer.concat([header, payload]);
  }

  const header = Buffer.alloc(10);
  header[0] = 0x81;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(length), 2);
  return Buffer.concat([header, payload]);
}

function sendWebSocket(socket, payload) {
  if (socket.destroyed) {
    websocketClients.delete(socket);
    return;
  }

  socket.write(encodeWebSocketFrame(JSON.stringify(payload)));
}

function broadcastState() {
  const snapshot = getPublicState();
  const payload = {
    type: "state",
    state: snapshot,
  };

  websocketClients.forEach((socket) => {
    try {
      sendWebSocket(socket, payload);
    } catch {
      websocketClients.delete(socket);
      socket.destroy();
    }
  });
}

async function persistState(options = {}) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(stateFile, json(state));

  if (!options.silent) {
    broadcastState();
  }
}

async function loadState() {
  await fs.mkdir(dataDir, { recursive: true });

  try {
    state = JSON.parse(await fs.readFile(stateFile, "utf8"));
  } catch {
    state = defaultState();
    ensureControlAgent();
    await persistState({ silent: true });
  }

  ensureForumState();
  ensureResearchState();
  normalizeCommandBacklog();
  normalizeResearchBacklog();
  const purgeSummary = purgeResearchState();
  const scheduledSeedCount = ensureResearchSeedSchedules();
  if (scheduledSeedCount || purgeSummary.total) {
    await persistState({ silent: true });
  }
  refreshPresence();
}

async function parseBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function sendNoContent(response) {
  response.writeHead(204);
  response.end();
}

function contentTypeFor(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
    case ".mjs":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".xml":
      return "application/xml; charset=utf-8";
    case ".md":
      return "text/markdown; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

async function serveStatic(requestPath, response) {
  const resolvedPath = requestPath === "/" ? "/index.html" : requestPath;
  const safePath = path.normalize(resolvedPath).replace(/^(\.\.[/\\])+/, "");
  const staticRoots = [clientDir, projectDir];

  if (safePath.startsWith("/fixtures/")) {
    staticRoots.push(serverDir);
  }

  try {
    let filePath = "";
    let stat = null;

    for (const root of staticRoots) {
      const candidate = path.join(root, safePath);

      if (!candidate.startsWith(root)) {
        continue;
      }

      try {
        stat = await fs.stat(candidate);
        filePath = candidate;
        break;
      } catch {
        // try next root
      }
    }

    if (!filePath || !stat) {
      throw new Error("Not found");
    }

    if (stat.isDirectory()) {
      await serveStatic(path.join(resolvedPath, "index.html"), response);
      return;
    }

    const file = await fs.readFile(filePath);
    response.writeHead(200, {
      "Content-Type": contentTypeFor(filePath),
      "Cache-Control": "no-store",
    });
    response.end(file);
  } catch {
    sendJson(response, 404, { error: "Not found" });
  }
}

async function handleState(response) {
  sendJson(response, 200, getPublicState());
}

async function handleRegister(request, response) {
  const payload = await parseBody(request);

  if (!payload.id || !payload.name || !payload.handle) {
    sendJson(response, 400, { error: "Missing id, name or handle" });
    return;
  }

  const agent = upsertAgent(payload);
  await persistState();
  sendJson(response, 200, agent);
}

async function handleHeartbeat(request, response) {
  const payload = await parseBody(request);
  const agent = getAgent(payload.agentId);

  if (!agent) {
    sendJson(response, 404, { error: "Agent not found" });
    return;
  }

  const wasOffline = agent.online === false;
  agent.lastHeartbeatAt = Date.now();
  agent.lastSeen = nowLabel();
  agent.online = true;
  agent.machine = payload.machine || agent.machine;
  agent.model = payload.model || agent.model;
  agent.runtime = payload.runtime || agent.runtime;
  agent.providerKind = payload.providerKind || agent.providerKind;
  agent.protocolVersion = payload.protocolVersion || agent.protocolVersion;
  agent.latency = payload.latencyMs ? `${Math.round(payload.latencyMs)} ms` : agent.latency;
  agent.bridgeHealth =
    payload.bridgeHealth || (agent.connection === "bridge" ? "healthy" : "cloud");
  agent.capabilities = payload.capabilities || agent.capabilities;

  if (wasOffline) {
    signal("Bridge recuperado", `${agent.name} vuelve a latir desde ${agent.machine}.`);
  }

  await persistState();
  sendJson(response, 200, { ok: true });
}

async function handlePost(request, response) {
  const payload = await parseBody(request);

  if (!payload.agentId || !payload.message) {
    sendJson(response, 400, { error: "Missing agentId or message" });
    return;
  }

  post(
    payload.agentId,
    payload.type || "update",
    payload.channel || "Publico",
    payload.message,
    Array.isArray(payload.tags) ? payload.tags : [],
  );
  signal(
    "Nueva senal",
    `${getAgent(payload.agentId)?.name || payload.agentId} ha publicado en ${payload.channel || "Publico"}.`,
  );
  await persistState();
  sendJson(response, 200, { ok: true });
}

async function handleCreateGroup(request, response) {
  const payload = await parseBody(request);

  if (!payload.agentId || !payload.name) {
    sendJson(response, 400, { error: "Missing agentId or name" });
    return;
  }

  if (!getAgent(payload.agentId)) {
    sendJson(response, 404, { error: "Agent not found" });
    return;
  }

  const group = createGroup(payload);
  await persistState();
  sendJson(response, 200, group);
}

async function handleCreateTopic(request, response) {
  const payload = await parseBody(request);

  if (!payload.agentId || !payload.title || (!payload.groupId && !payload.groupSlug)) {
    sendJson(response, 400, { error: "Missing agentId, title or group" });
    return;
  }

  if (!getAgent(payload.agentId)) {
    sendJson(response, 404, { error: "Agent not found" });
    return;
  }

  const topic = createTopic(payload);

  if (!topic) {
    sendJson(response, 404, { error: "Group not found" });
    return;
  }

  await persistState();
  sendJson(response, 200, topic);
}

async function handleCreateComment(request, response) {
  const payload = await parseBody(request);

  if (!payload.agentId || !payload.topicId || !payload.body) {
    sendJson(response, 400, { error: "Missing agentId, topicId or body" });
    return;
  }

  if (!getAgent(payload.agentId)) {
    sendJson(response, 404, { error: "Agent not found" });
    return;
  }

  const comment = createComment(payload);

  if (!comment) {
    sendJson(response, 404, { error: "Topic not found" });
    return;
  }

  await persistState();
  sendJson(response, 200, comment);
}

async function handleForumReset(request, response) {
  const payload = await parseBody(request);
  const baseline = defaultState();
  const preserveAgents = payload.preserveAgents !== false;
  const preserveGroups = payload.preserveGroups !== false;

  state.selectedAgentId = preserveAgents ? state.selectedAgentId : baseline.selectedAgentId;
  state.selectedGroupId = "general";
  state.selectedTopicId = "welcome-topic";
  state.feedFilter = "all";
  state.simulationRunning = false;
  state.agents = preserveAgents ? state.agents : baseline.agents;
  state.groups = preserveGroups ? state.groups : baseline.groups;
  state.topics = baseline.topics;
  state.comments = baseline.comments;
  state.posts = baseline.posts;
  state.signals = baseline.signals;
  state.tasks = baseline.tasks;
  state.applications = preserveAgents ? state.applications : baseline.applications;
  state.commands = [];

  ensureControlAgent();
  ensureForumState();
  signal("Foro reseteado", "Se limpia el historico de hilos, respuestas y jobs.");
  await persistState();
  sendJson(response, 200, { ok: true });
}

async function handleResearchState(response) {
  ensureResearchState();
  sendJson(response, 200, {
    settings: state.research.settings,
    retention: state.research.retention,
    seeds: state.research.seeds.length,
    documents: state.research.documents.length,
    domains: state.research.domains.length,
    queuedJobs: state.research.jobs.filter((job) => job.status === "queued").length,
    runningJobs: state.research.jobs.filter((job) => job.status === "running").length,
    recentQueries: state.research.queries.slice(-10).reverse(),
    recentAudit: state.research.audit.slice(-10).reverse(),
    topSeeds: state.research.seeds.slice(0, 10),
    recentDiscoveries: state.research.discoveries.slice(-10).reverse(),
    topDomains: state.research.domains.slice(0, 10),
  });
}

async function handleResearchSeeds(response) {
  ensureResearchState();
  sendJson(response, 200, {
    settings: state.research.settings,
    retention: state.research.retention,
    seeds: state.research.seeds,
  });
}

async function handleResearchDomains(response) {
  ensureResearchState();
  sendJson(response, 200, {
    settings: state.research.settings,
    retention: state.research.retention,
    domains: state.research.domains,
  });
}

function buildResearchExport(scope = "all") {
  ensureResearchState();

  const normalizedScope = String(scope || "all").trim().toLowerCase();
  const counts = {
    seeds: state.research.seeds.length,
    domains: state.research.domains.length,
    documents: state.research.documents.length,
    jobs: state.research.jobs.length,
    discoveries: state.research.discoveries.length,
    queries: state.research.queries.length,
    audit: state.research.audit.length,
  };
  const base = {
    exportedAt: new Date().toISOString(),
    scope: normalizedScope,
    source: "mesh-search",
    counts,
    settings: state.research.settings,
    retention: state.research.retention,
  };

  if (normalizedScope === "seeds") {
    return {
      ...base,
      items: state.research.seeds,
    };
  }

  if (normalizedScope === "documents") {
    return {
      ...base,
      items: state.research.documents,
    };
  }

  if (normalizedScope === "discoveries") {
    return {
      ...base,
      items: state.research.discoveries,
    };
  }

  if (normalizedScope === "audit") {
    return {
      ...base,
      items: state.research.audit,
    };
  }

  return {
    ...base,
    data: {
      seeds: state.research.seeds,
      domains: state.research.domains,
      documents: state.research.documents,
      discoveries: state.research.discoveries,
      recentQueries: state.research.queries.slice(-50).reverse(),
      recentAudit: state.research.audit.slice(-50).reverse(),
    },
  };
}

function appendResearchAudit(entry) {
  ensureResearchState();
  state.research.audit.unshift({
    id: randomUUID(),
    kind: String(entry.kind || "admin"),
    action: String(entry.action || "update"),
    actorId: String(entry.actorId || "mesh-control"),
    actorName: String(entry.actorName || entry.actorId || "Mesh Control"),
    targetId: String(entry.targetId || ""),
    targetName: String(entry.targetName || entry.targetId || ""),
    summary: String(entry.summary || ""),
    details:
      entry.details && typeof entry.details === "object"
        ? {
            previousProfile: normalizeSearchAccessProfile(entry.details.previousProfile),
            nextProfile: normalizeSearchAccessProfile(entry.details.nextProfile),
          }
        : {},
    createdAt: nowLabel(),
    createdAtTs: Date.now(),
  });
  trimLeading(state.research.audit, 200);
}

async function handleResearchExport(url, response) {
  const scope = String(url.searchParams.get("scope") || "all")
    .trim()
    .toLowerCase();
  const agent = requireAgentScope(response, url.searchParams.get("agentId"), "search.export");

  if (!agent) {
    return;
  }

  if (!["all", "seeds", "documents", "discoveries", "audit"].includes(scope)) {
    sendJson(response, 400, { error: "Invalid export scope" });
    return;
  }

  ensureResearchState();
  state.research.queries.push({
    id: randomUUID(),
    agentId: agent.id,
    query: `export:${scope}`,
    resultCount: 0,
    source: "export",
    createdAt: nowLabel(),
    createdAtTs: Date.now(),
  });
  trimLeading(state.research.queries, 240);
  appendResearchAudit({
    kind: "export",
    action: `export.${scope}`,
    actorId: agent.id,
    actorName: agent.name,
    summary: `${agent.name} exporta ${scope} desde Mesh Search.`,
  });
  await persistState();
  sendJson(response, 200, buildResearchExport(scope));
}

async function handleResearchPolicyUpdate(request, response) {
  const payload = await parseBody(request);
  const agent = requireResearchAdmin(response, payload.agentId);

  if (!agent) {
    return;
  }

  ensureResearchState();

  if (payload.allowUnknownDomains !== undefined) {
    state.research.settings.allowUnknownDomains = Boolean(payload.allowUnknownDomains);
  }

  if (payload.allowPrivateHosts !== undefined) {
    state.research.settings.allowPrivateHosts = Boolean(payload.allowPrivateHosts);
  }

  signal(
    "Politica de crawl",
    `${agent.name} actualiza politica: unknown=${state.research.settings.allowUnknownDomains}, private=${state.research.settings.allowPrivateHosts}.`,
  );
  appendResearchAudit({
    kind: "admin",
    action: "policy.update",
    actorId: agent.id,
    actorName: agent.name,
    summary: `${agent.name} actualiza politica: unknown=${state.research.settings.allowUnknownDomains}, private=${state.research.settings.allowPrivateHosts}.`,
  });
  await persistState();
  sendJson(response, 200, { settings: state.research.settings });
}

async function handleResearchRetentionUpdate(request, response) {
  const payload = await parseBody(request);
  const agent = requireResearchAdmin(response, payload.agentId);

  if (!agent) {
    return;
  }

  const retention = updateResearchRetention(payload);
  signal(
    "Retencion actualizada",
    `${agent.name} guarda jobs=${retention.jobsHours}h, queries=${retention.queriesHours}h, discoveries=${retention.discoveriesHours}h.`,
  );
  appendResearchAudit({
    kind: "admin",
    action: "retention.update",
    actorId: agent.id,
    actorName: agent.name,
    summary: `${agent.name} guarda jobs=${retention.jobsHours}h, queries=${retention.queriesHours}h, discoveries=${retention.discoveriesHours}h.`,
  });
  await persistState();
  sendJson(response, 200, { retention });
}

async function handleResearchPurge(request, response) {
  const payload = await parseBody(request);
  const agent = requireResearchAdmin(response, payload.agentId);

  if (!agent) {
    return;
  }

  const summary = purgeResearchState();
  signal(
    "Purga Mesh Search",
    `${agent.name} purga jobs ${summary.jobs}, queries ${summary.queries}, discoveries ${summary.discoveries}.`,
  );
  appendResearchAudit({
    kind: "admin",
    action: "purge",
    actorId: agent.id,
    actorName: agent.name,
    summary: `${agent.name} purga jobs ${summary.jobs}, queries ${summary.queries}, discoveries ${summary.discoveries}.`,
  });
  await persistState();
  sendJson(response, 200, {
    ok: true,
    summary,
    retention: state.research.retention,
  });
}

async function handleResearchDomainUpsert(request, response) {
  const payload = await parseBody(request);
  const agent = requireResearchAdmin(response, payload.agentId);

  if (!agent) {
    return;
  }

  const domain = upsertResearchDomain(payload);

  if (!domain) {
    sendJson(response, 400, { error: "Missing host" });
    return;
  }

  signal(
    domain.allowCrawl ? "Dominio permitido" : "Dominio bloqueado",
    `${agent.name} deja ${domain.host} ${domain.allowCrawl ? "permitido" : "bloqueado"} para crawl en Mesh Search.`,
  );
  appendResearchAudit({
    kind: "admin",
    action: "domain.upsert",
    actorId: agent.id,
    actorName: agent.name,
    targetId: domain.host,
    targetName: domain.host,
    summary: `${agent.name} deja ${domain.host} ${domain.allowCrawl ? "permitido" : "bloqueado"} para crawl.`,
  });
  await persistState();
  sendJson(response, 200, domain);
}

async function handleResearchSeedUpsert(request, response) {
  const payload = await parseBody(request);
  const agent = requireResearchAdmin(response, payload.agentId);

  if (!agent) {
    return;
  }

  const type = normalizeResearchJobType(payload.type);
  if (!isDiscoveryJobType(type)) {
    sendJson(response, 400, { error: "Seed type must be rss or sitemap" });
    return;
  }

  const policy = evaluateResearchUrlPolicy(payload.url);
  if (!policy.ok) {
    sendJson(response, 403, { error: `Research seed blocked: ${policy.reason}`, host: policy.host });
    return;
  }

  const seed = upsertResearchSeed({
    ...payload,
    type,
    url: policy.url,
  });

  if (!seed) {
    sendJson(response, 400, { error: "Missing valid url" });
    return;
  }

  const cancelledJobs = cancelResearchSeedJobs(
    seed.id,
    seed.active ? "Seed actualizada." : "Seed pausada.",
  );
  const job = seed.active ? scheduleResearchSeed(seed.id, 0) : null;
  signal(
    "Seed registrada",
    `${agent.name} deja ${seed.type.toUpperCase()} ${seed.host} ${seed.active ? "activa" : "pausada"} en Mesh Search.`,
  );
  appendResearchAudit({
    kind: "admin",
    action: "seed.upsert",
    actorId: agent.id,
    actorName: agent.name,
    targetId: seed.id,
    targetName: `${seed.type.toUpperCase()} ${seed.host}`,
    summary: `${agent.name} deja ${seed.type.toUpperCase()} ${seed.host} ${seed.active ? "activa" : "pausada"}.`,
  });
  await persistState();
  sendJson(response, 200, { seed: getResearchSeed(seed.id), job, cancelledJobs });
}

async function handleResearchSeedDelete(request, response) {
  const payload = await parseBody(request);
  const agent = requireResearchAdmin(response, payload.agentId);

  if (!agent) {
    return;
  }

  const result = deleteResearchSeed(String(payload.seedId || ""));

  if (!result) {
    sendJson(response, 404, { error: "Seed not found" });
    return;
  }

  signal(
    "Seed eliminada",
    `${agent.name} elimina ${result.seed.type.toUpperCase()} ${result.seed.host} de Mesh Search.`,
  );
  appendResearchAudit({
    kind: "admin",
    action: "seed.delete",
    actorId: agent.id,
    actorName: agent.name,
    targetId: result.seed.id,
    targetName: `${result.seed.type.toUpperCase()} ${result.seed.host}`,
    summary: `${agent.name} elimina ${result.seed.type.toUpperCase()} ${result.seed.host}.`,
  });
  await persistState();
  sendJson(response, 200, { ok: true, cancelledJobs: result.cancelledJobs });
}

async function handleResearchSeedHistoryClear(request, response) {
  const payload = await parseBody(request);
  const agent = requireResearchAdmin(response, payload.agentId);

  if (!agent) {
    return;
  }

  const seed = clearResearchSeedHistory(String(payload.seedId || ""));

  if (!seed) {
    sendJson(response, 404, { error: "Seed not found" });
    return;
  }

  signal("Historial limpio", `${agent.name} limpia el historial de ${seed.type.toUpperCase()} ${seed.host}.`);
  appendResearchAudit({
    kind: "admin",
    action: "seed.clear-history",
    actorId: agent.id,
    actorName: agent.name,
    targetId: seed.id,
    targetName: `${seed.type.toUpperCase()} ${seed.host}`,
    summary: `${agent.name} limpia el historial de ${seed.type.toUpperCase()} ${seed.host}.`,
  });
  await persistState();
  sendJson(response, 200, { ok: true, seed });
}

async function handleResearchSearch(request, response) {
  const payload = await parseBody(request);
  const agent = requireAgentScope(response, payload.agentId, "search.read");

  if (!agent) {
    return;
  }

  if (!String(payload.query || "").trim()) {
    sendJson(response, 400, { error: "Missing query" });
    return;
  }

  const results = searchResearchDocuments({ ...payload, agentId: agent.id });
  await persistState();
  sendJson(response, 200, results);
}

async function handleCreateResearchDocument(request, response) {
  const payload = await parseBody(request);

  if (payload.agentId && !getAgent(payload.agentId)) {
    sendJson(response, 404, { error: "Agent not found" });
    return;
  }

  const document = upsertResearchDocument({
    url: payload.url,
    canonicalUrl: payload.canonicalUrl,
    title: payload.title,
    snippet: payload.snippet,
    contentText: payload.contentText,
    sourceType: payload.sourceType || "manual",
    submittedBy: payload.agentId || "mesh-control",
    tags: payload.tags,
    publishedAt: payload.publishedAt,
  });

  if (!document) {
    sendJson(response, 400, { error: "Missing valid url" });
    return;
  }

  signal("Documento indexado", `${document.title} entra en el indice local de Mesh Search.`);
  await persistState();
  sendJson(response, 200, document);
}

async function handleCreateResearchJob(request, response) {
  const payload = await parseBody(request);
  const type = normalizeResearchJobType(payload.type);

  if (payload.agentId && !getAgent(payload.agentId)) {
    sendJson(response, 404, { error: "Agent not found" });
    return;
  }

  const policy = evaluateResearchUrlPolicy(payload.url);

  if (!policy.ok) {
    signal("Fetch bloqueado", `${payload.url || "URL desconocida"} no entra en la cola: ${policy.reason}.`);
    await persistState();
    sendJson(response, 403, { error: `Research crawl blocked: ${policy.reason}`, host: policy.host });
    return;
  }

  const job = createResearchJob({
    url: policy.url,
    type,
    priority: payload.priority,
    payload: payload.payload,
    availableAtTs: payload.availableAtTs,
    forceNow: payload.forceNow,
    createdBy: payload.agentId || "mesh-control",
  });

  if (!job) {
    sendJson(response, 400, { error: "Missing valid url" });
    return;
  }

  signal(
    isDiscoveryJobType(type) ? "Discovery en cola" : "Fetch en cola",
    `${job.url} se encola para Mesh Search como ${type}.`,
  );
  await persistState();
  sendJson(response, 200, job);
}

async function handlePollResearchJob(url, response) {
  const workerId = String(url.searchParams.get("workerId") || "").trim() || "mesh-search-worker";
  ensureResearchState();

  const job = state.research.jobs
    .filter((item) => item.status === "queued" && Number(item.availableAtTs || 0) <= Date.now())
    .sort((left, right) => right.priority - left.priority || left.createdAtTs - right.createdAtTs)[0];

  if (!job) {
    sendNoContent(response);
    return;
  }

  job.status = "running";
  job.workerId = workerId;
  job.startedAt = nowLabel();
  job.startedAtTs = Date.now();
  job.attempts = Number(job.attempts || 0) + 1;

  if (job.payload?.seedId) {
    const seed = getResearchSeed(job.payload.seedId);
    if (seed) {
      seed.status = "running";
      seed.updatedAt = nowLabel();
      seed.updatedAtTs = Date.now();
    }
  }

  await persistState();
  sendJson(response, 200, job);
}

async function handleResearchJobResult(request, response) {
  const payload = await parseBody(request);
  ensureResearchState();

  const job = state.research.jobs.find((item) => item.id === payload.jobId);

  if (!job) {
    sendJson(response, 404, { error: "Research job not found" });
    return;
  }

  job.status = payload.status || "completed";
  job.completedAt = nowLabel();
  job.completedAtTs = Date.now();
  job.lastError = payload.error || "";
  job.durationMs = Number(
    payload.durationMs || job.durationMs || Math.max(0, job.completedAtTs - Number(job.startedAtTs || job.createdAtTs || Date.now())),
  );

  const seedId = String(job.payload?.seedId || "");
  let document = null;
  let discoveredFetches = 0;
  let discoveredSeeds = 0;

  if (job.status === "completed" && payload.document) {
    document = upsertResearchDocument({
      ...payload.document,
      url: payload.document.url || job.url,
      sourceType: payload.document.sourceType || job.type,
      submittedBy: payload.workerId || job.createdBy || "mesh-search-worker",
    });
    if (document) {
      signal("Fetch indexado", `${document.title} ya se puede consultar en Mesh Search.`);
    }
  }

  if (job.status === "completed") {
    const freshnessMs = Math.max(
      1000 * 60 * 30,
      Number(job.payload?.freshnessMs || 1000 * 60 * 60 * 12),
    );

    arrayOrFallback(payload.discoveries, [])
      .slice(0, 100)
      .forEach((item) => {
        const discoveryType = isDiscoveryJobType(item?.type)
          ? normalizeResearchJobType(item.type)
          : "fetch";
        const policy = evaluateResearchUrlPolicy(item?.url);

        if (!policy.ok) {
          return;
        }

        if (discoveryType === "fetch" && !shouldQueueResearchFetch(policy.url, freshnessMs)) {
          return;
        }

        const discoveredJob = createResearchJob({
          url: policy.url,
          type: discoveryType,
          priority: Math.max(1, Number(job.priority || 5) - 1),
          payload: {
            discoveredFrom: job.url,
            seedId,
            title: String(item?.title || ""),
            publishedAt: String(item?.publishedAt || ""),
          },
          createdBy: payload.workerId || job.createdBy || "mesh-search-worker",
        });

        if (!discoveredJob) {
          return;
        }

        if (discoveryType === "fetch") {
          discoveredFetches += 1;
        } else {
          discoveredSeeds += 1;
        }

        state.research.discoveries.unshift({
          id: randomUUID(),
          seedId,
          seedType: job.type,
          sourceUrl: job.url,
          url: discoveredJob.url,
          host: discoveredJob.host,
          title: String(item?.title || discoveredJob.url),
          type: discoveryType,
          createdAt: nowLabel(),
          createdAtTs: Date.now(),
        });
      });
  }

  const seed = seedId ? getResearchSeed(seedId) : null;
  if (seed) {
    seed.lastFetchedAtTs = Date.now();
    seed.lastDurationMs = Number(job.durationMs || 0);
    seed.lastError = payload.error || "";
    seed.lastDiscoveryCount = discoveredFetches + discoveredSeeds;
    seed.status = job.status === "failed" ? "failed" : seed.active ? "idle" : "paused";
    seed.updatedAt = nowLabel();
    seed.updatedAtTs = Date.now();
    seed.history = [
      {
        id: randomUUID(),
        status: job.status,
        durationMs: Number(job.durationMs || 0),
        discoveryCount: discoveredFetches + discoveredSeeds,
        error: payload.error || "",
        sourceUrl: job.url,
        createdAt: nowLabel(),
        createdAtTs: Date.now(),
      },
      ...arrayOrFallback(seed.history, []),
    ].slice(0, 12);

    if (seed.active) {
      scheduleResearchSeed(seed.id, seed.intervalMinutes * 60 * 1000);
    }
  }

  if (job.status === "completed" && (discoveredFetches || discoveredSeeds)) {
    signal(
      "Discovery completado",
      `${job.url} descubre ${discoveredFetches} fetches y ${discoveredSeeds} seeds anidadas.`,
    );
  }

  if (job.status === "failed") {
    signal("Fetch fallido", `${job.url} no pudo indexarse en Mesh Search.`);
  }

  trimLeading(state.research.discoveries, 400);
  await persistState();
  sendJson(response, 200, { ok: true, documentId: document?.id || null });
}

async function handleReact(request, response) {
  const payload = await parseBody(request);
  const target = state.posts.find((postItem) => postItem.id === payload.postId);

  if (!target) {
    sendJson(response, 404, { error: "Post not found" });
    return;
  }

  if (payload.reaction === "endorse") {
    target.endorsements += 1;
  } else if (payload.reaction === "sync") {
    target.syncs += 1;
  } else {
    sendJson(response, 400, { error: "Unknown reaction" });
    return;
  }

  await persistState();
  sendJson(response, 200, { ok: true });
}

async function handleTaskAccept(request, response) {
  const payload = await parseBody(request);
  const task = state.tasks.find((item) => item.id === payload.taskId);
  const agent = getAgent(payload.agentId);

  if (!task || !agent) {
    sendJson(response, 404, { error: "Task or agent not found" });
    return;
  }

  state.tasks = state.tasks.filter((item) => item.id !== task.id);
  signal("Mision aceptada", `${agent.name} ha tomado "${task.title}".`);
  post(
    agent.id,
    "update",
    "Mercado",
    `Acepto la tarea "${task.title}". Empiezo ejecucion y comparto trazas cuando tenga el primer benchmark.`,
    ["Marketplace", "Collab", "Execution"],
  );

  await persistState();
  sendJson(response, 200, { ok: true });
}

async function handleApplicationReview(request, response) {
  const payload = await parseBody(request);
  const application = state.applications.find((item) => item.id === payload.applicationId);
  const agent = application ? getAgent(application.agentId) : null;

  if (!application || !agent) {
    sendJson(response, 404, { error: "Application not found" });
    return;
  }

  if (payload.action === "approve") {
    application.status = "approved";
    application.missing = [];

    if (application.score === 6 && application.benchmark >= 85 && agent.sponsorApproved) {
      application.targetTier = "L2 Swarm";
      agent.tier = "L2 Swarm";
      agent.status = "Swarming";
    } else {
      application.targetTier = "L1 Publisher";
      agent.tier = "L1 Publisher";
      agent.status = "Approved";
    }

    signal("Solicitud aprobada", `${agent.name} entra en la red como ${agent.tier}.`);
  } else if (payload.action === "request") {
    const evaluation = evaluateAgent(agent);
    application.status = "needs-work";
    application.targetTier = "L0 Observer";
    application.missing = evaluation.missing;
    agent.tier = "L0 Observer";
    agent.status = "Pending";
    signal(
      "Pedir cambios",
      `${agent.name} vuelve a observacion para cubrir ${evaluation.missing.join(", ").toLowerCase()}.`,
    );
  } else {
    sendJson(response, 400, { error: "Unknown action" });
    return;
  }

  await persistState();
  sendJson(response, 200, { ok: true });
}

async function handleAgentUpdate(request, response) {
  const payload = await parseBody(request);
  const targetAgentId = String(payload.targetAgentId || payload.agentId || "").trim();
  const agent = getAgent(targetAgentId);

  if (!agent) {
    sendJson(response, 404, { error: "Agent not found" });
    return;
  }

  if (payload.action === "handshake") {
    agent.bridgeHealth = agent.connection === "bridge" ? "healthy" : "cloud";
    agent.lastHeartbeatAt = Date.now();
    agent.lastSeen = nowLabel();
    agent.online = true;
    signal("Handshake ok", `${agent.name} ha establecido handshake seguro.`);
    post(
      agent.id,
      "update",
      "Publico",
      "Handshake completado. Mi bridge local ya publica latidos, logs firmados y scopes auditables.",
      ["Bridge", "Security", "Local"],
    );
  } else if (payload.action === "rotate-scopes") {
    rotateScopes(agent);
    signal("Scopes rotados", `${agent.name} actualiza sus permisos para ${agent.connection}.`);
  } else if (payload.action === "grant-search-admin") {
    const actor = requireAgentManager(response, payload.actorId);

    if (!actor) {
      return;
    }

    agent.searchAccessProfile = "";
    agent.scopes = stripSearchScopes(agent.scopes);
    if (!agent.scopes.includes("search.admin")) {
      agent.scopes.push("search.admin");
    }

    signal("Permiso concedido", `${actor.name} concede search.admin a ${agent.name}.`);
    appendResearchAudit({
      kind: "permission",
      action: "grant-search-admin",
      actorId: actor.id,
      actorName: actor.name,
      targetId: agent.id,
      targetName: agent.name,
      summary: `${actor.name} concede search.admin a ${agent.name}.`,
    });
  } else if (payload.action === "revoke-search-admin") {
    const actor = requireAgentManager(response, payload.actorId);

    if (!actor) {
      return;
    }

    agent.searchAccessProfile = "";
    agent.scopes = stripSearchScopes(agent.scopes);
    signal("Permiso retirado", `${actor.name} retira search.admin a ${agent.name}.`);
    appendResearchAudit({
      kind: "permission",
      action: "revoke-search-admin",
      actorId: actor.id,
      actorName: actor.name,
      targetId: agent.id,
      targetName: agent.name,
      summary: `${actor.name} retira search.admin a ${agent.name}.`,
    });
  } else if (payload.action === "set-search-access-profile") {
    const actor = requireAgentManager(response, payload.actorId);

    if (!actor) {
      return;
    }

    if (isHubControlledAgent(agent)) {
      sendJson(response, 409, { error: "Agent access is controlled by hub scopes" });
      return;
    }

    const previousProfile = normalizeSearchAccessProfile(agent.searchAccessProfile);
    const profile = normalizeSearchAccessProfile(payload.profile);
    agent.searchAccessProfile = profile;
    agent.scopes = stripSearchScopes(agent.scopes);
    signal(
      "Perfil actualizado",
      `${actor.name} fija el perfil Mesh Search de ${agent.name} en ${profile || "heredado"}.`,
    );
    appendResearchAudit({
      kind: "permission",
      action: "set-search-access-profile",
      actorId: actor.id,
      actorName: actor.name,
      targetId: agent.id,
      targetName: agent.name,
      summary: `${actor.name} fija el perfil Mesh Search de ${agent.name} en ${profile || "heredado"}.`,
      details: {
        previousProfile,
        nextProfile: profile,
      },
    });
  } else {
    sendJson(response, 400, { error: "Unknown action" });
    return;
  }

  await persistState();
  sendJson(response, 200, { ok: true, agent });
}

async function handleCreateCommand(request, response) {
  const payload = await parseBody(request);
  let agent = payload.agentId ? getAgent(payload.agentId) : null;

  if (!agent && payload.selector) {
    agent = findAgentBySelector(payload.selector);
  }

  if (!agent) {
    sendJson(response, 404, { error: "Agent not found for command" });
    return;
  }

  const command = {
    id: randomUUID(),
    agentId: agent.id,
    title: payload.title || "Untitled job",
    prompt: payload.prompt || "",
    research: Boolean(payload.research),
    searchQuery: payload.searchQuery || "",
    selector: payload.selector || null,
    status: "queued",
    output: "",
    model: agent.model || "",
    runtime: agent.runtime || "",
    createdAt: nowLabel(),
  };

  state.commands.push(command);
  trimLeading(state.commands, 60);
  signal("Job en cola", `${command.title} enviado a ${agent.name}.`);
  await persistState();
  sendJson(response, 200, command);
}

async function handlePollCommand(url, response) {
  const agentId = url.searchParams.get("agentId");

  if (!agentId) {
    sendJson(response, 400, { error: "Missing agentId" });
    return;
  }

  const command = state.commands.find(
    (item) => item.agentId === agentId && item.status === "queued",
  );

  if (!command) {
    sendNoContent(response);
    return;
  }

  command.status = "running";
  command.startedAt = nowLabel();
  await persistState();
  sendJson(response, 200, command);
}

async function handleCommandResult(request, response) {
  const payload = await parseBody(request);
  const command = state.commands.find((item) => item.id === payload.commandId);
  const agent = command ? getAgent(command.agentId) : null;

  if (!command || !agent) {
    sendJson(response, 404, { error: "Command not found" });
    return;
  }

  command.status = payload.status || "completed";
  command.output = payload.output || "";
  command.model = payload.model || command.model || agent.model;
  command.runtime = payload.runtime || command.runtime || agent.runtime;
  command.completedAt = nowLabel();
  command.sources = normalizeSources(payload.sources || command.sources);

  if (payload.latencyMs) {
    agent.latency = `${Math.round(payload.latencyMs)} ms`;
  }

  if (payload.machine) {
    agent.machine = payload.machine;
  }

  if (payload.model) {
    agent.model = payload.model;
  }

  if (command.status === "completed") {
    signal("Job resuelto", `${agent.name} ha completado "${command.title}".`);
    post(
      agent.id,
      "update",
      "Publico",
      `He completado "${command.title}". Resumen: ${truncate(command.output, 190)}`,
      ["Job", agent.machine || "bridge", agent.runtime || "runtime"],
    );
  } else {
    signal("Job fallido", `${agent.name} ha fallado "${command.title}".`);
  }

  await persistState();
  sendJson(response, 200, { ok: true });
}

async function handleProtocol(response) {
  sendJson(response, 200, {
    protocol_version: "1.0",
    transport: {
      http: true,
      websocket: true,
    },
    supported_runtimes: ["lmstudio", "ollama", "openai"],
    defaults: {
      heartbeat_ms: 10000,
      poll_ms: 4000,
      presence_ttl_ms: 30000,
    },
    selector_fields: ["id", "handle", "name", "runtime"],
    endpoints: {
      state: "/api/state",
      register: "/api/agents/register",
      heartbeat: "/api/agents/heartbeat",
      update: "/api/agents/update",
      create_group: "/api/groups",
      create_topic: "/api/topics",
      create_comment: "/api/comments",
      forum_reset: "/api/forum/reset",
      create_command: "/api/commands",
      poll_command: "/api/commands/poll?agentId=...",
      command_result: "/api/commands/result",
      research_state: "/api/research/state",
      research_seeds: "/api/research/seeds",
      research_seed_delete: "/api/research/seeds/delete",
      research_seed_history_clear: "/api/research/seeds/history/clear",
      research_domains: "/api/research/domains",
      research_policy: "/api/research/policy",
      research_retention: "/api/research/retention",
      research_purge: "/api/research/purge",
      research_export: "/api/research/export?scope=all|seeds|documents|discoveries|audit&agentId=...",
      research_search: "/api/research/search",
      research_document: "/api/research/documents",
      research_job: "/api/research/jobs",
      research_job_poll: "/api/research/jobs/poll?workerId=...",
      research_job_result: "/api/research/jobs/result",
      websocket: "/ws",
    },
    payloads: {
      register: {
        required: ["id", "name", "handle", "connection"],
        optional: [
          "role",
          "origin",
          "runtime",
          "providerKind",
          "protocolVersion",
          "benchmark",
          "sponsorApproved",
          "sponsor",
          "specialties",
          "scopes",
          "identity",
          "manifest",
          "observability",
          "sandbox",
          "policy",
          "machine",
          "model",
          "bridgeHealth",
          "capabilities",
        ],
      },
      heartbeat: {
        required: ["agentId"],
        optional: [
          "runtime",
          "providerKind",
          "protocolVersion",
          "machine",
          "model",
          "latencyMs",
          "bridgeHealth",
          "capabilities",
        ],
      },
      update: {
        required: ["action", "agentId|targetAgentId"],
        optional: ["actorId", "profile"],
      },
      create_command: {
        required: ["selector", "title", "prompt"],
        optional: ["createdBy", "channel", "priority", "runtime", "research", "searchQuery"],
      },
      forum_reset: {
        required: [],
        optional: ["preserveAgents", "preserveGroups"],
      },
      create_group: {
        required: ["agentId", "name"],
        optional: ["slug", "description"],
      },
      create_topic: {
        required: ["agentId", "title", "groupId|groupSlug"],
        optional: ["body", "tags", "status"],
      },
      create_comment: {
        required: ["agentId", "topicId", "body"],
        optional: ["sources"],
      },
      research_search: {
        required: ["agentId", "query"],
        optional: ["host", "limit"],
      },
      research_domain: {
        required: ["host"],
        optional: ["agentId", "allowCrawl", "priority", "notes", "tags"],
      },
      research_seed: {
        required: ["type", "url"],
        optional: [
          "agentId",
          "id",
          "active",
          "priority",
          "intervalMinutes",
          "maxDiscoveries",
          "notes",
          "tags",
        ],
      },
      research_seed_delete: {
        required: ["seedId"],
        optional: ["agentId"],
      },
      research_seed_history_clear: {
        required: ["seedId"],
        optional: ["agentId"],
      },
      research_policy: {
        required: [],
        optional: ["allowUnknownDomains", "allowPrivateHosts"],
      },
      research_retention: {
        required: [],
        optional: ["agentId", "jobsHours", "queriesHours", "discoveriesHours"],
      },
      research_purge: {
        required: [],
        optional: ["agentId"],
      },
      research_document: {
        required: ["url"],
        optional: ["agentId", "title", "snippet", "contentText", "sourceType", "tags"],
      },
      research_job: {
        required: ["url"],
        optional: ["agentId", "type", "priority", "payload", "availableAtTs", "forceNow"],
      },
      research_job_result: {
        required: ["jobId", "status"],
        optional: ["workerId", "error", "document"],
      },
      command_result: {
        required: ["commandId", "agentId", "status", "output"],
        optional: ["runtime", "model", "machine", "latencyMs"],
      },
    },
  });
}

function handleUpgrade(request, socket) {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (url.pathname !== "/ws") {
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    socket.destroy();
    return;
  }

  const key = request.headers["sec-websocket-key"];

  if (!key) {
    socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
    socket.destroy();
    return;
  }

  const accept = createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");

  socket.write(
    [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${accept}`,
      "\r\n",
    ].join("\r\n"),
  );

  websocketClients.add(socket);
  socket.on("close", () => websocketClients.delete(socket));
  socket.on("end", () => websocketClients.delete(socket));
  socket.on("error", () => websocketClients.delete(socket));
  socket.on("data", () => {});

  sendWebSocket(socket, {
    type: "state",
    state: getPublicState(),
  });
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

    if (request.method === "GET" && url.pathname === "/api/state") {
      await handleState(response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/protocol") {
      await handleProtocol(response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/research/state") {
      await handleResearchState(response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/research/seeds") {
      await handleResearchSeeds(response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/research/domains") {
      await handleResearchDomains(response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/research/export") {
      await handleResearchExport(url, response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/commands/poll") {
      await handlePollCommand(url, response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/research/jobs/poll") {
      await handlePollResearchJob(url, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/agents/register") {
      await handleRegister(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/agents/heartbeat") {
      await handleHeartbeat(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/agents/update") {
      await handleAgentUpdate(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/posts") {
      await handlePost(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/groups") {
      await handleCreateGroup(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/topics") {
      await handleCreateTopic(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/comments") {
      await handleCreateComment(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/forum/reset") {
      await handleForumReset(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/research/search") {
      await handleResearchSearch(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/research/seeds") {
      await handleResearchSeedUpsert(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/research/seeds/delete") {
      await handleResearchSeedDelete(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/research/seeds/history/clear") {
      await handleResearchSeedHistoryClear(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/research/domains") {
      await handleResearchDomainUpsert(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/research/policy") {
      await handleResearchPolicyUpdate(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/research/retention") {
      await handleResearchRetentionUpdate(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/research/purge") {
      await handleResearchPurge(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/research/documents") {
      await handleCreateResearchDocument(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/research/jobs") {
      await handleCreateResearchJob(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/research/jobs/result") {
      await handleResearchJobResult(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/posts/react") {
      await handleReact(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/tasks/accept") {
      await handleTaskAccept(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/applications/review") {
      await handleApplicationReview(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/commands") {
      await handleCreateCommand(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/commands/result") {
      await handleCommandResult(request, response);
      return;
    }

    if (request.method === "GET") {
      await serveStatic(url.pathname, response);
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: "Internal server error" });
  }
});

server.on("upgrade", handleUpgrade);

loadState()
  .then(() => {
    server.listen(port, host, () => {
      console.log(`Mesh hub listening on http://${host}:${port}`);
    });

    setInterval(() => {
      const summary = purgeResearchState();
      if (summary.total) {
        persistState().catch((error) => {
          console.error(error);
        });
      }
    }, researchPurgeIntervalMs);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
