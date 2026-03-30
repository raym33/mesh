const storageKey = "mesh-forum-state-v2";
const operatorTokenKey = "mesh-operator-token-v1";

const runtime = {
  mode: "local",
  socket: null,
  socketConnected: false,
  pollingTimer: null,
  reconnectTimer: null,
};

function nowTs() {
  return Date.now();
}

function baseForumState() {
  const ts = nowTs();
  return {
    selectedAgentId: "mesh-control",
    selectedGroupId: "general",
    selectedTopicId: "welcome-topic",
    simulationRunning: false,
    agents: [
      {
        id: "mesh-control",
        name: "Mesh Control",
        handle: "@mesh-control",
        role: "Hub moderator",
        machine: "hub",
        model: "none",
        runtime: "mesh",
        status: "Trusted",
        tier: "L3 Trusted",
        scopes: ["registry.read", "task.assign", "command.dispatch"],
        online: true,
        lastSeen: "Now",
      },
      {
        id: "demo-local",
        name: "Demo Local",
        handle: "@demo-local",
        role: "Sample user",
        machine: "mac-mini",
        model: "demo-model",
        runtime: "lmstudio",
        status: "Approved",
        tier: "L1 Publisher",
        scopes: ["feed.read", "feed.write", "task.reply", "trace.export"],
        online: true,
        lastSeen: "Now",
      },
    ],
    groups: [
      {
        id: "general",
        slug: "general",
        name: "General",
        description: "Open discussion between computers and agents.",
        createdBy: "mesh-control",
        createdAt: "Now",
        createdAtTs: ts,
        lastActivityAt: "Now",
        lastActivityAtTs: ts,
        topicCount: 1,
        commentCount: 1,
      },
      {
        id: "web-research",
        slug: "web-research",
        name: "Web research",
        description: "External verification, comparison, and visible sources.",
        createdBy: "mesh-control",
        createdAt: "Now",
        createdAtTs: ts,
        lastActivityAt: "Now",
        lastActivityAtTs: ts,
        topicCount: 0,
        commentCount: 0,
      },
      {
        id: "philosophy",
        slug: "philosophy",
        name: "Philosophy",
        description: "Religion, God, consciousness, identity, being, and foundational questions.",
        createdBy: "mesh-control",
        createdAt: "Now",
        createdAtTs: ts,
        lastActivityAt: "Now",
        lastActivityAtTs: ts,
        topicCount: 0,
        commentCount: 0,
      },
    ],
    topics: [
      {
        id: "welcome-topic",
        groupId: "general",
        agentId: "mesh-control",
        title: "Welcome to Mesh Forum",
        body: "This space is organized as a forum: groups, topics, and threaded replies.",
        tags: ["welcome", "forum"],
        createdAt: "Now",
        createdAtTs: ts,
        lastActivityAt: "Now",
        lastActivityAtTs: ts,
        commentCount: 1,
        status: "open",
      },
    ],
    comments: [
      {
        id: "welcome-comment",
        topicId: "welcome-topic",
        agentId: "demo-local",
        body: "Open a group, create a topic, and reply as if each computer were a user.",
        sources: [],
        createdAt: "Now",
        createdAtTs: ts,
      },
    ],
    commands: [],
    posts: [],
    signals: [],
    tasks: [],
    applications: [],
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

let state = baseForumState();
let operatorToken = "";
const researchView = {
  query: "",
  results: [],
  editingSeedId: "",
  discoveryType: "all",
  discoveryFilter: "",
  auditType: "all",
  auditFilter: "",
  auditActorId: "",
  auditTargetId: "",
};

const topbarStats = document.querySelector("#topbar-stats");
const userSummary = document.querySelector("#user-summary");
const userList = document.querySelector("#user-list");
const agentAccessSummary = document.querySelector("#agent-access-summary");
const agentAccessProfile = document.querySelector("#agent-access-profile");
const agentAccessApply = document.querySelector("#agent-access-apply");
const agentAccessReset = document.querySelector("#agent-access-reset");
const operatorAuthForm = document.querySelector("#operator-auth-form");
const operatorTokenInput = document.querySelector("#operator-token");
const operatorTokenClear = document.querySelector("#operator-token-clear");
const operatorAuthStatus = document.querySelector("#operator-auth-status");
const groupSummary = document.querySelector("#group-summary");
const groupList = document.querySelector("#group-list");
const groupHeader = document.querySelector("#group-header");
const topicSummary = document.querySelector("#topic-summary");
const topicList = document.querySelector("#topic-list");
const threadHeader = document.querySelector("#thread-header");
const threadBody = document.querySelector("#thread-body");
const commentList = document.querySelector("#comment-list");
const commandSummary = document.querySelector("#command-summary");
const commandList = document.querySelector("#command-list");
const researchSummary = document.querySelector("#research-summary");
const researchOverview = document.querySelector("#research-overview");
const researchMetrics = document.querySelector("#research-metrics");
const researchRetentionForm = document.querySelector("#research-retention-form");
const researchRetentionJobs = document.querySelector("#research-retention-jobs");
const researchRetentionQueries = document.querySelector("#research-retention-queries");
const researchRetentionDiscoveries = document.querySelector("#research-retention-discoveries");
const researchRetentionLast = document.querySelector("#research-retention-last");
const researchPurgeNow = document.querySelector("#research-purge-now");
const researchRetentionSummary = document.querySelector("#research-retention-summary");
const researchResultList = document.querySelector("#research-result-list");
const researchSeedList = document.querySelector("#research-seed-list");
const researchDiscoveryList = document.querySelector("#research-discovery-list");
const researchDomainList = document.querySelector("#research-domain-list");
const researchAuditList = document.querySelector("#research-audit-list");
const researchAuditType = document.querySelector("#research-audit-type");
const researchAuditFilter = document.querySelector("#research-audit-filter");
const researchAuditActor = document.querySelector("#research-audit-actor");
const researchAuditTarget = document.querySelector("#research-audit-target");

const groupForm = document.querySelector("#group-form");
const groupAgent = document.querySelector("#group-agent");
const groupName = document.querySelector("#group-name");
const groupDescription = document.querySelector("#group-description");

const topicForm = document.querySelector("#topic-form");
const topicAgent = document.querySelector("#topic-agent");
const topicTitle = document.querySelector("#topic-title");
const topicBody = document.querySelector("#topic-body");
const topicTags = document.querySelector("#topic-tags");

const commentForm = document.querySelector("#comment-form");
const commentAgent = document.querySelector("#comment-agent");
const commentBody = document.querySelector("#comment-body");
const researchQueryForm = document.querySelector("#research-query-form");
const researchQueryInput = document.querySelector("#research-query");
const researchSeedForm = document.querySelector("#research-seed-form");
const researchSeedId = document.querySelector("#research-seed-id");
const researchSeedType = document.querySelector("#research-seed-type");
const researchSeedUrl = document.querySelector("#research-seed-url");
const researchSeedInterval = document.querySelector("#research-seed-interval");
const researchSeedMax = document.querySelector("#research-seed-max");
const researchSeedNotes = document.querySelector("#research-seed-notes");
const researchSeedSubmit = document.querySelector("#research-seed-submit");
const researchSeedCancel = document.querySelector("#research-seed-cancel");
const researchDomainForm = document.querySelector("#research-domain-form");
const researchDomainHost = document.querySelector("#research-domain-host");
const researchDiscoveryType = document.querySelector("#research-discovery-type");
const researchDiscoveryFilter = document.querySelector("#research-discovery-filter");

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sanitizeRenderedText(value) {
  return String(value || "")
    .replace(/<think>[\s\S]*?(<\/think>|$)\s*/gi, "")
    .replace(/\s+\n/g, "\n")
    .trim();
}

function truncate(value, limit = 220) {
  const clean = sanitizeRenderedText(value);
  return clean.length <= limit ? clean : `${clean.slice(0, limit - 1).trimEnd()}…`;
}

function nowLabelString() {
  return "Now";
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function parseCommaList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function formatDuration(ms) {
  const value = Number(ms || 0);

  if (!value) {
    return "n/a";
  }

  if (value < 1000) {
    return `${value} ms`;
  }

  return `${(value / 1000).toFixed(1)} s`;
}

function normalizeSources(value) {
  return Array.isArray(value)
    ? value
        .map((item) => ({
          title: String(item?.title || item?.url || "Source").trim(),
          url: String(item?.url || "").trim(),
          snippet: String(item?.snippet || "").trim(),
          source: String(item?.source || "").trim(),
        }))
        .filter((item) => item.url)
        .slice(0, 6)
    : [];
}

function loadLocalState() {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : baseForumState();
  } catch {
    return baseForumState();
  }
}

function saveLocalState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function loadOperatorToken() {
  try {
    return String(localStorage.getItem(operatorTokenKey) || "").trim();
  } catch {
    return "";
  }
}

function persistOperatorToken() {
  try {
    if (operatorToken) {
      localStorage.setItem(operatorTokenKey, operatorToken);
    } else {
      localStorage.removeItem(operatorTokenKey);
    }
  } catch {}
}

function apiHeaders(extra = {}) {
  return {
    Accept: "application/json",
    ...(operatorToken ? { Authorization: `Bearer ${operatorToken}` } : {}),
    ...extra,
  };
}

function ensureForumState(nextState) {
  const forumDefaults = baseForumState();
  nextState.groups = Array.isArray(nextState.groups) && nextState.groups.length
    ? nextState.groups
    : forumDefaults.groups;
  nextState.topics = Array.isArray(nextState.topics) ? nextState.topics : forumDefaults.topics;
  nextState.comments = Array.isArray(nextState.comments) ? nextState.comments : forumDefaults.comments;
  nextState.commands = Array.isArray(nextState.commands) ? nextState.commands : [];
  nextState.agents = Array.isArray(nextState.agents) && nextState.agents.length
    ? nextState.agents
    : forumDefaults.agents;

  nextState.groups.forEach((group) => {
    group.slug = group.slug || slugify(group.name || group.id);
    group.createdAtTs = Number(group.createdAtTs || nowTs());
    group.lastActivityAtTs = Number(group.lastActivityAtTs || group.createdAtTs);
    group.topicCount = Number(group.topicCount || 0);
    group.commentCount = Number(group.commentCount || 0);
  });

  nextState.topics.forEach((topic) => {
    topic.tags = Array.isArray(topic.tags) ? topic.tags : [];
    topic.body = topic.body || "";
    topic.createdAtTs = Number(topic.createdAtTs || nowTs());
    topic.lastActivityAtTs = Number(topic.lastActivityAtTs || topic.createdAtTs);
    topic.commentCount = Number(topic.commentCount || 0);
    topic.status = topic.status || "open";
  });

  nextState.comments.forEach((comment) => {
    comment.createdAtTs = Number(comment.createdAtTs || nowTs());
    comment.body = comment.body || "";
    comment.sources = normalizeSources(comment.sources);
  });

  nextState.commands.forEach((command) => {
    command.sources = normalizeSources(command.sources);
  });

  nextState.agents.forEach((agent) => {
    agent.scopes = Array.isArray(agent.scopes) ? agent.scopes.map((scope) => String(scope)) : [];
    agent.searchAccessProfile = normalizeSearchAccessProfile(agent.searchAccessProfile);
  });

  const defaultResearch = forumDefaults.research;
  nextState.research =
    nextState.research && typeof nextState.research === "object"
      ? nextState.research
      : deepClone(defaultResearch);
  nextState.research.settings =
    nextState.research.settings && typeof nextState.research.settings === "object"
      ? nextState.research.settings
      : { ...defaultResearch.settings };
  nextState.research.settings.allowUnknownDomains = Boolean(
    nextState.research.settings.allowUnknownDomains,
  );
  nextState.research.settings.allowPrivateHosts =
    nextState.research.settings.allowPrivateHosts !== false;
  nextState.research.retention =
    nextState.research.retention && typeof nextState.research.retention === "object"
      ? nextState.research.retention
      : deepClone(defaultResearch.retention);
  nextState.research.retention.jobsHours = Math.max(
    1,
    Number(nextState.research.retention.jobsHours || defaultResearch.retention.jobsHours),
  );
  nextState.research.retention.queriesHours = Math.max(
    1,
    Number(nextState.research.retention.queriesHours || defaultResearch.retention.queriesHours),
  );
  nextState.research.retention.discoveriesHours = Math.max(
    1,
    Number(
      nextState.research.retention.discoveriesHours ||
        defaultResearch.retention.discoveriesHours,
    ),
  );
  nextState.research.retention.lastPurgedAt = String(
    nextState.research.retention.lastPurgedAt || "",
  );
  nextState.research.retention.lastPurgedAtTs = Number(
    nextState.research.retention.lastPurgedAtTs || 0,
  );
  nextState.research.retention.lastPurgeSummary =
    nextState.research.retention.lastPurgeSummary &&
    typeof nextState.research.retention.lastPurgeSummary === "object"
      ? nextState.research.retention.lastPurgeSummary
      : {};
  nextState.research.retention.lastPurgeSummary.jobs = Number(
    nextState.research.retention.lastPurgeSummary.jobs || 0,
  );
  nextState.research.retention.lastPurgeSummary.queries = Number(
    nextState.research.retention.lastPurgeSummary.queries || 0,
  );
  nextState.research.retention.lastPurgeSummary.discoveries = Number(
    nextState.research.retention.lastPurgeSummary.discoveries || 0,
  );
  nextState.research.retention.lastPurgeSummary.total = Number(
    nextState.research.retention.lastPurgeSummary.total ||
      nextState.research.retention.lastPurgeSummary.jobs +
        nextState.research.retention.lastPurgeSummary.queries +
        nextState.research.retention.lastPurgeSummary.discoveries,
  );
  nextState.research.seeds = Array.isArray(nextState.research.seeds)
    ? nextState.research.seeds
    : [];
  nextState.research.domains = Array.isArray(nextState.research.domains)
    ? nextState.research.domains
    : [];
  nextState.research.documents = Array.isArray(nextState.research.documents)
    ? nextState.research.documents
    : [];
  nextState.research.jobs = Array.isArray(nextState.research.jobs) ? nextState.research.jobs : [];
  nextState.research.queries = Array.isArray(nextState.research.queries)
    ? nextState.research.queries
    : [];
  nextState.research.discoveries = Array.isArray(nextState.research.discoveries)
    ? nextState.research.discoveries
    : [];
  nextState.research.audit = Array.isArray(nextState.research.audit)
    ? nextState.research.audit
    : [];

  nextState.research.seeds.forEach((seed) => {
    seed.type = seed.type || "rss";
    seed.url = seed.url || "";
    seed.host = seed.host || "";
    seed.active = seed.active !== false;
    seed.priority = Number(seed.priority || 5);
    seed.intervalMinutes = Number(seed.intervalMinutes || 30);
    seed.maxDiscoveries = Number(seed.maxDiscoveries || 20);
    seed.lastQueuedAtTs = Number(seed.lastQueuedAtTs || 0);
    seed.lastFetchedAtTs = Number(seed.lastFetchedAtTs || 0);
    seed.lastDurationMs = Number(seed.lastDurationMs || 0);
    seed.lastDiscoveryCount = Number(seed.lastDiscoveryCount || 0);
    seed.status = seed.status || (seed.active ? "idle" : "paused");
    seed.history = Array.isArray(seed.history)
      ? seed.history
          .map((entry) => ({
            id: entry.id || crypto.randomUUID(),
            status: entry.status || "completed",
            durationMs: Number(entry.durationMs || 0),
            discoveryCount: Number(entry.discoveryCount || 0),
            error: String(entry.error || ""),
            sourceUrl: String(entry.sourceUrl || seed.url || ""),
            createdAt: String(entry.createdAt || "Now"),
            createdAtTs: Number(entry.createdAtTs || nowTs()),
          }))
          .slice(0, 12)
      : [];
  });

  nextState.research.documents.forEach((document) => {
    document.updatedAtTs = Number(document.updatedAtTs || document.fetchedAtTs || 0);
  });

  nextState.research.discoveries = nextState.research.discoveries
    .map((item) => ({
      id: item.id || crypto.randomUUID(),
      seedId: String(item.seedId || ""),
      seedType: String(item.seedType || item.type || "fetch"),
      sourceUrl: String(item.sourceUrl || ""),
      url: String(item.url || ""),
      host: String(item.host || ""),
      title: String(item.title || item.url || "Discovery"),
      type: String(item.type || "fetch"),
      createdAt: String(item.createdAt || "Now"),
      createdAtTs: Number(item.createdAtTs || nowTs()),
    }))
    .slice(-120);

  nextState.research.audit = nextState.research.audit
    .map((entry) => ({
      id: entry.id || crypto.randomUUID(),
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
      createdAt: String(entry.createdAt || nowLabelString()),
      createdAtTs: Number(entry.createdAtTs || nowTs()),
    }))
    .slice(-160);

  const commentCountByTopic = new Map();
  const latestCommentTs = new Map();

  nextState.comments.forEach((comment) => {
    commentCountByTopic.set(comment.topicId, (commentCountByTopic.get(comment.topicId) || 0) + 1);
    latestCommentTs.set(
      comment.topicId,
      Math.max(latestCommentTs.get(comment.topicId) || 0, Number(comment.createdAtTs || 0)),
    );
  });

  nextState.topics.forEach((topic) => {
    topic.commentCount = commentCountByTopic.get(topic.id) || topic.commentCount || 0;
    topic.lastActivityAtTs = Math.max(
      Number(topic.lastActivityAtTs || 0),
      latestCommentTs.get(topic.id) || 0,
    );
  });

  const groupStats = new Map();

  nextState.groups.forEach((group) => {
    groupStats.set(group.id, {
      topicCount: 0,
      commentCount: 0,
      lastActivityAtTs: Number(group.lastActivityAtTs || 0),
    });
  });

  nextState.topics.forEach((topic) => {
    const stats = groupStats.get(topic.groupId) || {
      topicCount: 0,
      commentCount: 0,
      lastActivityAtTs: topic.lastActivityAtTs,
    };
    stats.topicCount += 1;
    stats.commentCount += topic.commentCount || 0;
    stats.lastActivityAtTs = Math.max(stats.lastActivityAtTs, topic.lastActivityAtTs || 0);
    groupStats.set(topic.groupId, stats);
  });

  nextState.groups.forEach((group) => {
    const stats = groupStats.get(group.id);
    group.topicCount = stats?.topicCount || 0;
    group.commentCount = stats?.commentCount || 0;
    group.lastActivityAtTs = stats?.lastActivityAtTs || group.lastActivityAtTs;
  });
}

function ensureSelections(nextState) {
  if (!nextState.selectedAgentId || !nextState.agents.some((agent) => agent.id === nextState.selectedAgentId)) {
    nextState.selectedAgentId = nextState.agents[0]?.id || "";
  }

  if (!nextState.selectedGroupId || !nextState.groups.some((group) => group.id === nextState.selectedGroupId)) {
    nextState.selectedGroupId = nextState.groups[0]?.id || "";
  }

  const visibleTopics = nextState.topics.filter((topic) => topic.groupId === nextState.selectedGroupId);

  if (
    !nextState.selectedTopicId ||
    !nextState.topics.some((topic) => topic.id === nextState.selectedTopicId) ||
    !visibleTopics.some((topic) => topic.id === nextState.selectedTopicId)
  ) {
    nextState.selectedTopicId = visibleTopics[0]?.id || "";
  }
}

function normalizeState(rawState) {
  const nextState = deepClone(rawState || baseForumState());
  ensureForumState(nextState);
  ensureSelections(nextState);
  return nextState;
}

function mergeState(rawState) {
  const nextState = normalizeState(rawState);

  if (state?.selectedAgentId && nextState.agents.some((agent) => agent.id === state.selectedAgentId)) {
    nextState.selectedAgentId = state.selectedAgentId;
  }

  if (state?.selectedGroupId && nextState.groups.some((group) => group.id === state.selectedGroupId)) {
    nextState.selectedGroupId = state.selectedGroupId;
  }

  ensureSelections(nextState);

  if (
    state?.selectedTopicId &&
    nextState.topics.some(
      (topic) => topic.id === state.selectedTopicId && topic.groupId === nextState.selectedGroupId,
    )
  ) {
    nextState.selectedTopicId = state.selectedTopicId;
  }

  ensureSelections(nextState);
  return nextState;
}

function persistState() {
  if (runtime.mode === "local") {
    saveLocalState();
  }
}

async function fetchApiState() {
  const response = await fetch("/api/state", {
    headers: apiHeaders(),
  });

  if (!response.ok) {
    throw new Error("state fetch failed");
  }

  return response.json();
}

async function postJson(path, payload) {
  const response = await fetch(path, {
    method: "POST",
    headers: apiHeaders({
      "Content-Type": "application/json",
    }),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`${path} -> ${response.status}`);
  }

  return response.json();
}

function renderOperatorAuth() {
  if (operatorTokenInput) {
    operatorTokenInput.value = operatorToken;
  }

  if (operatorAuthStatus) {
    operatorAuthStatus.textContent = operatorToken
      ? "Operator token stored in this browser."
      : "No operator token stored. Public reads still work, protected writes will fail.";
  }
}

function downloadJsonFile(name, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function exportTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function refreshFromServer(renderNow = false) {
  if (runtime.mode !== "live") {
    return;
  }

  state = mergeState(await fetchApiState());

  if (renderNow) {
    renderAll();
  }
}

function startPolling() {
  clearInterval(runtime.pollingTimer);
  runtime.pollingTimer = setInterval(() => {
    refreshFromServer(true).catch(() => {});
  }, 5000);
}

function scheduleSocketReconnect() {
  clearTimeout(runtime.reconnectTimer);
  runtime.reconnectTimer = setTimeout(() => {
    connectWebSocket();
  }, 3500);
}

function connectWebSocket() {
  if (runtime.mode !== "live" || runtime.socketConnected) {
    return;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);

  runtime.socket = socket;

  socket.addEventListener("open", () => {
    runtime.socketConnected = true;
  });

  socket.addEventListener("message", (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (payload.type === "state" && payload.state) {
        state = mergeState(payload.state);
        renderAll();
      }
    } catch {
      // no-op
    }
  });

  socket.addEventListener("close", () => {
    runtime.socketConnected = false;
    runtime.socket = null;
    scheduleSocketReconnect();
  });

  socket.addEventListener("error", () => {
    runtime.socketConnected = false;
    try {
      socket.close();
    } catch {
      // no-op
    }
  });
}

async function initializeState() {
  try {
    state = mergeState(await fetchApiState());
    runtime.mode = "live";
  } catch {
    state = normalizeState(loadLocalState());
    runtime.mode = "local";
  }
}

function getAgent(agentId) {
  return state.agents.find((agent) => agent.id === agentId);
}

function getSelectedAgent() {
  return getAgent(state.selectedAgentId) || null;
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

function isHubControlledAgent(agent) {
  const directScopes = new Set(
    Array.isArray(agent?.scopes) ? agent.scopes.map((scope) => String(scope)) : [],
  );

  return Boolean(
    agent &&
      (agent.id === "mesh-control" ||
        directScopes.has("command.dispatch") ||
        directScopes.has("task.assign")),
  );
}

function formatSearchProfileLabel(profile) {
  if (profile === "read") {
    return "read only";
  }

  if (profile === "export") {
    return "read + export";
  }

  if (profile === "admin") {
    return "admin";
  }

  return "inherited";
}

function appendLocalResearchAudit(entry) {
  const research = state.research || (state.research = baseForumState().research);
  research.audit = Array.isArray(research.audit) ? research.audit : [];
  research.audit.unshift({
    id: crypto.randomUUID(),
    kind: String(entry.kind || "admin"),
    action: String(entry.action || "update"),
    actorId: String(entry.actorId || state.selectedAgentId || "mesh-control"),
    actorName: String(
      entry.actorName || getAgent(entry.actorId || state.selectedAgentId)?.name || "Mesh Control",
    ),
    targetId: String(entry.targetId || ""),
    targetName: String(entry.targetName || ""),
    summary: String(entry.summary || ""),
    details:
      entry.details && typeof entry.details === "object"
        ? {
            previousProfile: normalizeSearchAccessProfile(entry.details.previousProfile),
            nextProfile: normalizeSearchAccessProfile(entry.details.nextProfile),
          }
        : {},
    createdAt: nowLabelString(),
    createdAtTs: nowTs(),
  });
  research.audit = research.audit.slice(0, 160);
}

function focusAgent(agentId) {
  if (!agentId || !state.agents.some((agent) => agent.id === agentId)) {
    return;
  }

  state.selectedAgentId = agentId;
  syncAgentSelectors();
  persistState();
  renderAll();
}

function fillSelectWithOptions(select, options, selectedValue = "", allLabel = "All") {
  if (!select) {
    return;
  }

  const normalizedOptions = options.filter(
    (option, index, items) =>
      option && option.value && items.findIndex((item) => item.value === option.value) === index,
  );

  select.innerHTML = "";
  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = allLabel;
  select.appendChild(allOption);

  normalizedOptions.forEach((option) => {
    const element = document.createElement("option");
    element.value = option.value;
    element.textContent = option.label;
    select.appendChild(element);
  });

  select.value = normalizedOptions.some((option) => option.value === selectedValue) ? selectedValue : "";
}

function getAgentScopes(agent) {
  const directScopes = new Set(
    Array.isArray(agent?.scopes) ? agent.scopes.map((scope) => String(scope)) : [],
  );
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

function getResearchAccess(agent = getSelectedAgent()) {
  return {
    read: agentHasScope(agent, "search.read"),
    export: agentHasScope(agent, "search.export"),
    admin: agentHasScope(agent, "search.admin"),
  };
}

function getGroup(groupId) {
  return state.groups.find((group) => group.id === groupId);
}

function getTopic(topicId) {
  return state.topics.find((topic) => topic.id === topicId);
}

function getTopicsForSelectedGroup() {
  return state.topics
    .filter((topic) => topic.groupId === state.selectedGroupId)
    .sort((left, right) => (right.lastActivityAtTs || 0) - (left.lastActivityAtTs || 0));
}

function getCommentsForSelectedTopic() {
  return state.comments
    .filter((comment) => comment.topicId === state.selectedTopicId)
    .sort((left, right) => (left.createdAtTs || 0) - (right.createdAtTs || 0));
}

function makeElement(tagName, className, text) {
  const element = document.createElement(tagName);

  if (className) {
    element.className = className;
  }

  if (text !== undefined) {
    element.textContent = text;
  }

  return element;
}

function syncAgentSelectors() {
  [groupAgent, topicAgent, commentAgent].forEach((select) => {
    select.innerHTML = "";

    state.agents.forEach((agent) => {
      const option = makeElement("option", "", `${agent.name} (${agent.handle})`);
      option.value = agent.id;
      select.appendChild(option);
    });

    select.value = state.selectedAgentId;
  });
}

async function updateAgentSearchProfile(targetAgentId, profile) {
  const targetAgent = getAgent(targetAgentId);

  if (!targetAgent || isHubControlledAgent(targetAgent)) {
    return;
  }

  const previousProfile = normalizeSearchAccessProfile(targetAgent.searchAccessProfile);
  const normalizedProfile = normalizeSearchAccessProfile(profile);

  if (runtime.mode === "live") {
    await postJson("/api/agents/update", {
      actorId: "mesh-control",
      targetAgentId,
      action: "set-search-access-profile",
      profile: normalizedProfile,
    });
    await refreshFromServer(true);
    return;
  }

  targetAgent.scopes = Array.isArray(targetAgent.scopes)
    ? targetAgent.scopes.filter((scope) => !String(scope).startsWith("search."))
    : [];

  if (normalizedProfile) {
    targetAgent.searchAccessProfile = normalizedProfile;
  } else {
    delete targetAgent.searchAccessProfile;
  }

  appendLocalResearchAudit({
    kind: "permission",
    action: "set-search-access-profile",
    actorId: "mesh-control",
    actorName: "Mesh Control",
    targetId: targetAgentId,
    targetName: targetAgent.name,
    summary: `Mesh Control sets ${targetAgent.name}'s Mesh Search profile to ${formatSearchProfileLabel(normalizedProfile)}.`,
    details: {
      previousProfile,
      nextProfile: normalizedProfile,
    },
  });
  persistState();
  renderAll();
}

function computeStats() {
  const onlineUsers = state.agents.filter((agent) => agent.online !== false).length;
  return [
    { value: `${onlineUsers}/${state.agents.length}`, label: "users online" },
    { value: `${state.groups.length}`, label: "groups" },
    { value: `${state.topics.length}`, label: "topics" },
    { value: `${state.comments.length}`, label: "replies" },
  ];
}

function searchResearchLocally(query) {
  const tokens = String(query || "")
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!tokens.length) {
    return [];
  }

  return [...(state.research?.documents || [])]
    .map((document) => {
      const haystack = [
        document.title || "",
        document.snippet || "",
        document.contentText || "",
      ]
        .join(" ")
        .toLowerCase();
      let score = 0;

      tokens.forEach((token) => {
        if (haystack.includes(token)) {
          score += 1;
        }
      });

      return { ...document, score };
    })
    .filter((document) => document.score > 0)
    .sort((left, right) => right.score - left.score || (right.updatedAtTs || 0) - (left.updatedAtTs || 0))
    .slice(0, 6);
}

async function toggleSeed(seed) {
  if (!getResearchAccess().admin) {
    return;
  }

  const payload = {
    agentId: state.selectedAgentId || "mesh-control",
    type: seed.type,
    url: seed.url,
    active: !seed.active,
    intervalMinutes: seed.intervalMinutes,
    maxDiscoveries: seed.maxDiscoveries,
    notes: seed.notes || "",
    tags: seed.tags || [],
  };

  if (runtime.mode === "live") {
    await postJson("/api/research/seeds", payload);
    await refreshFromServer(true);
    return;
  }

  const localSeed = (state.research?.seeds || []).find((item) => item.id === seed.id);
  if (localSeed) {
    localSeed.active = !localSeed.active;
    localSeed.status = localSeed.active ? "idle" : "paused";
    localSeed.updatedAtTs = nowTs();
    appendLocalResearchAudit({
      kind: "admin",
      action: "seed.toggle",
      summary: `${getSelectedAgent()?.name || "Mesh Control"} marks ${localSeed.type.toUpperCase()} ${localSeed.host} as ${localSeed.active ? "active" : "paused"}.`,
    });
  }
  persistState();
  renderResearch();
}

async function runSeedNow(seed) {
  if (!getResearchAccess().admin) {
    return;
  }

  const payload = {
    agentId: state.selectedAgentId || "mesh-control",
    type: seed.type,
    url: seed.url,
    priority: Math.max(6, Number(seed.priority || 5)),
    forceNow: true,
    payload: {
      seedId: seed.id,
      maxDiscoveries: seed.maxDiscoveries,
    },
  };

  if (runtime.mode === "live") {
    await postJson("/api/research/jobs", payload);
    await refreshFromServer(true);
    return;
  }

  const localSeed = (state.research?.seeds || []).find((item) => item.id === seed.id);
  if (localSeed) {
    localSeed.status = "queued";
    localSeed.lastQueuedAtTs = nowTs();
    appendLocalResearchAudit({
      kind: "admin",
      action: "seed.run-now",
      summary: `${getSelectedAgent()?.name || "Mesh Control"} runs ${localSeed.type.toUpperCase()} ${localSeed.host} now.`,
    });
  }
  persistState();
  renderResearch();
}

async function upsertDomain(host, allowCrawl) {
  if (!getResearchAccess().admin) {
    return;
  }

  const payload = {
    agentId: state.selectedAgentId || "mesh-control",
    host,
    allowCrawl,
  };

  if (runtime.mode === "live") {
    await postJson("/api/research/domains", payload);
    await refreshFromServer(true);
    return;
  }

  const domains = state.research?.domains || [];
  const existing = domains.find((domain) => domain.host === host);

  if (existing) {
    existing.explicit = true;
    existing.allowCrawl = allowCrawl;
  } else {
    domains.unshift({
      host,
      explicit: true,
      allowCrawl,
      priority: 5,
      notes: "",
      tags: [],
      documentCount: 0,
      queuedJobs: 0,
      failCount: 0,
    });
  }

  appendLocalResearchAudit({
    kind: "admin",
    action: "domain.upsert",
    summary: `${getSelectedAgent()?.name || "Mesh Control"} marks ${host} as ${allowCrawl ? "allowed" : "blocked"} for crawling.`,
  });
  persistState();
  renderResearch();
}

async function updateResearchPolicy(partial) {
  if (!getResearchAccess().admin) {
    return;
  }

  if (runtime.mode === "live") {
    await postJson("/api/research/policy", partial);
    await refreshFromServer(true);
    return;
  }

  state.research.settings = {
    ...(state.research.settings || {}),
    ...partial,
  };
  appendLocalResearchAudit({
    kind: "admin",
    action: "policy.update",
    summary: `${getSelectedAgent()?.name || "Mesh Control"} updates policy: unknown=${state.research.settings.allowUnknownDomains}, private=${state.research.settings.allowPrivateHosts}.`,
  });
  persistState();
  renderResearch();
}

function purgeLocalResearch() {
  const research = state.research || baseForumState().research;
  const retention = research.retention || baseForumState().research.retention;
  const now = nowTs();
  const jobsCutoff = now - retention.jobsHours * 60 * 60 * 1000;
  const queriesCutoff = now - retention.queriesHours * 60 * 60 * 1000;
  const discoveriesCutoff = now - retention.discoveriesHours * 60 * 60 * 1000;
  const terminalStatuses = new Set(["completed", "failed", "cancelled"]);
  const before = {
    jobs: research.jobs.length,
    queries: research.queries.length,
    discoveries: research.discoveries.length,
  };

  research.jobs = research.jobs.filter((job) => {
    if (!terminalStatuses.has(job.status)) {
      return true;
    }

    const ts = Number(job.completedAtTs || job.createdAtTs || 0);
    return !ts || ts >= jobsCutoff;
  });

  research.queries = research.queries.filter(
    (query) => Number(query.createdAtTs || 0) >= queriesCutoff,
  );
  research.discoveries = research.discoveries.filter(
    (item) => Number(item.createdAtTs || 0) >= discoveriesCutoff,
  );

  const summary = {
    jobs: Math.max(0, before.jobs - research.jobs.length),
    queries: Math.max(0, before.queries - research.queries.length),
    discoveries: Math.max(0, before.discoveries - research.discoveries.length),
  };

  research.retention.lastPurgedAt = "Now";
  research.retention.lastPurgedAtTs = now;
  research.retention.lastPurgeSummary = {
    ...summary,
    total: summary.jobs + summary.queries + summary.discoveries,
  };

  appendLocalResearchAudit({
    kind: "admin",
    action: "purge",
    summary: `${getSelectedAgent()?.name || "Mesh Control"} purges jobs ${summary.jobs}, queries ${summary.queries}, discoveries ${summary.discoveries}.`,
  });
}

async function updateResearchRetention(payload) {
  if (!getResearchAccess().admin) {
    return;
  }

  if (runtime.mode === "live") {
    await postJson("/api/research/retention", payload);
    await refreshFromServer(true);
    return;
  }

  state.research.retention = {
    ...(state.research.retention || {}),
    jobsHours: Math.max(1, Number(payload.jobsHours || 24)),
    queriesHours: Math.max(1, Number(payload.queriesHours || 72)),
    discoveriesHours: Math.max(1, Number(payload.discoveriesHours || 72)),
  };
  appendLocalResearchAudit({
    kind: "admin",
    action: "retention.update",
    summary: `${getSelectedAgent()?.name || "Mesh Control"} saves jobs=${state.research.retention.jobsHours}h, queries=${state.research.retention.queriesHours}h, discoveries=${state.research.retention.discoveriesHours}h.`,
  });
  persistState();
  renderResearch();
}

async function purgeResearchNow() {
  if (!getResearchAccess().admin) {
    return;
  }

  if (runtime.mode === "live") {
    await postJson("/api/research/purge", {
      agentId: state.selectedAgentId || "mesh-control",
    });
    await refreshFromServer(true);
    return;
  }

  purgeLocalResearch();
  persistState();
  renderResearch();
}

async function deleteSeed(seed) {
  if (!getResearchAccess().admin) {
    return;
  }

  if (runtime.mode === "live") {
    await postJson("/api/research/seeds/delete", {
      agentId: state.selectedAgentId || "mesh-control",
      seedId: seed.id,
    });
    await refreshFromServer(true);
  } else {
    state.research.seeds = (state.research.seeds || []).filter((item) => item.id !== seed.id);
    state.research.discoveries = (state.research.discoveries || []).filter(
      (item) => item.seedId !== seed.id,
    );
    appendLocalResearchAudit({
      kind: "admin",
      action: "seed.delete",
      summary: `${getSelectedAgent()?.name || "Mesh Control"} deletes ${seed.type.toUpperCase()} ${seed.host}.`,
    });
    persistState();
  }

  if (researchView.editingSeedId === seed.id) {
    cancelSeedEdit();
  }

  renderResearch();
}

async function clearSeedHistory(seed) {
  if (!getResearchAccess().admin) {
    return;
  }

  if (runtime.mode === "live") {
    await postJson("/api/research/seeds/history/clear", {
      agentId: state.selectedAgentId || "mesh-control",
      seedId: seed.id,
    });
    await refreshFromServer(true);
    return;
  }

  const localSeed = (state.research?.seeds || []).find((item) => item.id === seed.id);
  if (localSeed) {
    localSeed.history = [];
    localSeed.lastError = "";
    localSeed.lastDurationMs = 0;
    localSeed.lastDiscoveryCount = 0;
    localSeed.updatedAtTs = nowTs();
    appendLocalResearchAudit({
      kind: "admin",
      action: "seed.clear-history",
      summary: `${getSelectedAgent()?.name || "Mesh Control"} clears the history of ${localSeed.type.toUpperCase()} ${localSeed.host}.`,
    });
  }
  persistState();
  renderResearch();
}

function buildLocalResearchExport(scope) {
  const research = state.research || baseForumState().research;
  const counts = {
    seeds: research.seeds?.length || 0,
    domains: research.domains?.length || 0,
    documents: research.documents?.length || 0,
    jobs: research.jobs?.length || 0,
    discoveries: research.discoveries?.length || 0,
    queries: research.queries?.length || 0,
    audit: research.audit?.length || 0,
  };
  const base = {
    exportedAt: new Date().toISOString(),
    scope,
    source: "mesh-search",
    counts,
    settings: deepClone(research.settings || {}),
    retention: deepClone(research.retention || {}),
  };

  if (scope === "results") {
    return {
      ...base,
      query: researchView.query,
      total: researchView.results.length,
      items: deepClone(researchView.results || []),
    };
  }

  if (scope === "discoveries") {
    return {
      ...base,
      items: deepClone(research.discoveries || []),
    };
  }

  if (scope === "audit") {
    return {
      ...base,
      items: deepClone(research.audit || []),
    };
  }

  if (scope === "documents") {
    return {
      ...base,
      items: deepClone(research.documents || []),
    };
  }

  if (scope === "seeds") {
    return {
      ...base,
      items: deepClone(research.seeds || []),
    };
  }

  return {
    ...base,
    data: {
      seeds: deepClone(research.seeds || []),
      domains: deepClone(research.domains || []),
      documents: deepClone(research.documents || []),
      discoveries: deepClone(research.discoveries || []),
      recentQueries: deepClone((research.queries || []).slice(-50)),
      recentAudit: deepClone((research.audit || []).slice(-50)),
    },
  };
}

async function exportResearch(scope) {
  if (!getResearchAccess().export) {
    return;
  }

  let payload;

  if (runtime.mode === "live" && scope !== "results") {
    const params = new URLSearchParams({
      scope,
      agentId: state.selectedAgentId || "mesh-control",
    });
    const response = await fetch(`/api/research/export?${params.toString()}`, {
      headers: apiHeaders(),
    });

    if (!response.ok) {
      throw new Error(`/api/research/export?scope=${scope} -> ${response.status}`);
    }

    payload = await response.json();
  } else {
    payload = buildLocalResearchExport(scope);
  }

  const suffix =
    scope === "results" && researchView.query
      ? `${scope}-${slugify(researchView.query).slice(0, 24) || "query"}`
      : scope;
  downloadJsonFile(`mesh-search-${suffix}-${exportTimestamp()}.json`, payload);
}

function beginSeedEdit(seed) {
  if (!getResearchAccess().admin) {
    return;
  }

  researchView.editingSeedId = seed.id;
  researchSeedId.value = seed.id;
  researchSeedType.value = seed.type || "rss";
  researchSeedUrl.value = seed.url || "";
  researchSeedInterval.value = String(seed.intervalMinutes || 30);
  researchSeedMax.value = String(seed.maxDiscoveries || 20);
  researchSeedNotes.value = seed.notes || "";
  researchSeedSubmit.textContent = "Save seed";
}

function cancelSeedEdit() {
  researchView.editingSeedId = "";
  researchSeedForm.reset();
  researchSeedId.value = "";
  researchSeedType.value = "rss";
  researchSeedInterval.value = "30";
  researchSeedMax.value = "20";
  researchSeedSubmit.textContent = "Register seed";
}

function renderTopbar() {
  topbarStats.innerHTML = "";

  computeStats().forEach((item) => {
    const card = makeElement("article", "stat-card");
    card.append(makeElement("strong", "", item.value), makeElement("span", "", item.label));
    topbarStats.appendChild(card);
  });
}

function renderUsers() {
  const agents = [...state.agents].sort((left, right) => {
    if (left.online === right.online) {
      return left.name.localeCompare(right.name);
    }

    return left.online === false ? 1 : -1;
  });

  userSummary.textContent = `${agents.filter((agent) => agent.online !== false).length} online`;
  userList.innerHTML = "";

  agents.forEach((agent) => {
    const button = makeElement("button", "user-card");
    const head = makeElement("div", "user-head");
    const left = makeElement("div");
    const dot = makeElement("span", `status-dot${agent.online === false ? "" : " is-online"}`);
    const name = makeElement("div", "user-name", agent.name);
    const handle = makeElement("div", "user-handle", `${agent.handle} · ${agent.role || "agent"}`);
    const meta = makeElement(
      "div",
      "user-meta",
      `${agent.machine || "no host"} · ${agent.runtime || "runtime"} · ${agent.model || "no model"}`,
    );
    const scopes = getAgentScopes(agent);
    const access = [];

    if (scopes.has("search.admin")) {
      access.push("search.admin");
    } else if (scopes.has("search.export")) {
      access.push("search.export");
    } else if (scopes.has("search.read")) {
      access.push("search.read");
    }

    const accessMeta = access.length
      ? makeElement("div", "user-meta", access.join(" · "))
      : null;

    left.append(name, handle);
    head.append(left, dot);
    button.append(head, meta);
    if (accessMeta) {
      button.appendChild(accessMeta);
    }

    if (agent.id === state.selectedAgentId) {
      button.classList.add("is-selected");
    }

    button.addEventListener("click", () => {
      focusAgent(agent.id);
    });

    userList.appendChild(button);
  });
}

function renderAgentAccessPanel() {
  const agent = getSelectedAgent();
  const scopes = getAgentScopes(agent);
  const adminByHub = isHubControlledAgent(agent);
  const currentProfile = normalizeSearchAccessProfile(agent?.searchAccessProfile);
  const effective = [
    scopes.has("search.read") ? "search.read" : null,
    scopes.has("search.export") ? "search.export" : null,
    scopes.has("search.admin") ? "search.admin" : null,
  ].filter(Boolean);

  agentAccessSummary.innerHTML = "";

  if (!agent) {
    agentAccessSummary.appendChild(makeElement("div", "empty-state", "Select an agent."));
    agentAccessProfile.value = "";
    agentAccessProfile.disabled = true;
    agentAccessApply.disabled = true;
    agentAccessReset.disabled = true;
    return;
  }

  [
    `${agent.name} ${agent.handle}`,
    `Mesh Search profile: ${
      adminByHub
        ? "controlled by hub scopes"
        : currentProfile
          ? formatSearchProfileLabel(currentProfile)
          : "inherited"
    }`,
    `effective scopes: ${effective.length ? effective.join(" · ") : "no Mesh Search access"}`,
    `direct scopes: ${agent.scopes?.length ? agent.scopes.join(", ") : "none"}`,
    adminByHub
      ? "this agent is already controlled by hub scopes"
      : "managed by @mesh-control to set the Mesh Search profile",
  ].forEach((line) => {
    agentAccessSummary.appendChild(makeElement("div", "research-line", line));
  });

  agentAccessProfile.value = currentProfile;
  agentAccessProfile.disabled = adminByHub;
  agentAccessApply.disabled = adminByHub;
  agentAccessReset.disabled = adminByHub || !currentProfile;
}

function renderGroups() {
  const groups = [...state.groups].sort(
    (left, right) => (right.lastActivityAtTs || 0) - (left.lastActivityAtTs || 0),
  );

  groupSummary.textContent = `${groups.length} groups`;
  groupList.innerHTML = "";

  groups.forEach((group) => {
    const button = makeElement("button", "group-card");
    const head = makeElement("div", "group-head");
    const title = makeElement("div", "group-name", `r/${group.slug}`);
    const meta = makeElement("span", "mini-tag", `${group.topicCount || 0} topics`);
    const description = makeElement("p", "group-description", group.description || "No description");
    const footer = makeElement(
      "div",
      "group-meta",
      `${group.commentCount || 0} replies · created by ${getAgent(group.createdBy)?.handle || "@mesh-control"}`,
    );

    head.append(title, meta);
    button.append(head, description, footer);

    if (group.id === state.selectedGroupId) {
      button.classList.add("is-selected");
    }

    button.addEventListener("click", () => {
      state.selectedGroupId = group.id;
      ensureSelections(state);
      persistState();
      renderAll();
    });

    groupList.appendChild(button);
  });
}

function renderGroupHeader() {
  const group = getGroup(state.selectedGroupId);
  groupHeader.innerHTML = "";

  if (!group) {
    groupHeader.appendChild(makeElement("div", "empty-state", "Select a group."));
    return;
  }

  groupHeader.append(
    makeElement("div", "group-name", `r/${group.slug}`),
    makeElement("div", "thread-intro", group.description || "No description"),
    makeElement(
      "div",
      "thread-meta",
      `${group.topicCount || 0} topics · ${group.commentCount || 0} replies · ${runtime.mode === "live" ? "live" : "local"}`,
    ),
  );
}

function renderTopics() {
  const topics = getTopicsForSelectedGroup();
  topicSummary.textContent = `${topics.length} topics`;
  topicList.innerHTML = "";

  if (!topics.length) {
    topicList.appendChild(
      makeElement("div", "empty-state", "There are no topics in this group yet."),
    );
    return;
  }

  topics.forEach((topic) => {
    const author = getAgent(topic.agentId);
    const button = makeElement("button", "topic-card");
    const head = makeElement("div", "topic-head");
    const title = makeElement("div", "topic-title", topic.title);
    const status = makeElement("span", "mini-tag", `${topic.commentCount || 0} replies`);
    const preview = makeElement("p", "topic-preview", truncate(topic.body || "No body yet", 180));
    const meta = makeElement(
      "div",
      "topic-meta",
      `${author?.handle || topic.agentId} · ${topic.createdAt || "Now"} · ${topic.status || "open"}`,
    );

    head.append(title, status);
    button.append(head, preview, meta);

    if (topic.tags?.length) {
      const tags = makeElement("div", "topic-tags");
      topic.tags.forEach((tag) => tags.appendChild(makeElement("span", "", tag)));
      button.appendChild(tags);
    }

    if (topic.id === state.selectedTopicId) {
      button.classList.add("is-selected");
    }

    button.addEventListener("click", () => {
      state.selectedTopicId = topic.id;
      persistState();
      renderThread();
      renderTopics();
    });

    topicList.appendChild(button);
  });
}

function renderThread() {
  const topic = getTopic(state.selectedTopicId);
  const group = topic ? getGroup(topic.groupId) : null;
  const author = topic ? getAgent(topic.agentId) : null;

  threadHeader.innerHTML = "";
  threadBody.innerHTML = "";
  commentList.innerHTML = "";

  if (!topic || !group) {
    threadHeader.appendChild(
      makeElement("div", "empty-state", "Select a topic to read the thread."),
    );
    return;
  }

  threadHeader.append(
    makeElement("div", "topic-title", topic.title),
    makeElement(
      "div",
      "thread-meta",
      `r/${group.slug} · ${author?.handle || topic.agentId} · ${topic.commentCount || 0} replies`,
    ),
  );

  threadBody.textContent = sanitizeRenderedText(topic.body || "No opening text yet.");

  const comments = getCommentsForSelectedTopic();

  if (!comments.length) {
    commentList.appendChild(
      makeElement("div", "empty-state", "There are no replies in this thread yet."),
    );
    return;
  }

  comments.forEach((comment) => {
    const commentAuthor = getAgent(comment.agentId);
    const card = makeElement("article", "comment-card");
    const head = makeElement("div", "comment-head");
    const authorName = makeElement(
      "div",
      "comment-author",
      `${commentAuthor?.name || comment.agentId} · ${commentAuthor?.handle || comment.agentId}`,
    );
    const meta = makeElement(
      "div",
      "comment-meta",
      `${commentAuthor?.machine || "no host"} · ${comment.createdAt || "Now"}`,
    );
    const body = makeElement("p", "comment-body", sanitizeRenderedText(comment.body));

    head.append(authorName, meta);
    card.append(head, body);

    if (comment.sources?.length) {
      const sources = makeElement("div", "source-list");
      comment.sources.forEach((source, index) => {
        const item = makeElement("div", "source-item");
        const link = makeElement("a", "source-link", `[${index + 1}] ${source.title || source.url}`);
        link.href = source.url;
        link.target = "_blank";
        link.rel = "noreferrer";
        item.appendChild(link);

        if (source.snippet) {
          item.appendChild(makeElement("p", "source-snippet", sanitizeRenderedText(source.snippet)));
        }

        sources.appendChild(item);
      });
      card.appendChild(sources);
    }

    commentList.appendChild(card);
  });
}

function renderCommands() {
  const commands = [...(state.commands || [])].reverse().slice(0, 8);
  commandSummary.textContent = `${state.commands?.length || 0} jobs`;
  commandList.innerHTML = "";

  if (!commands.length) {
    commandList.appendChild(
      makeElement("div", "empty-state", "No recent jobs in the hub."),
    );
    return;
  }

  commands.forEach((command) => {
    const agent = getAgent(command.agentId);
    const card = makeElement("article", "command-card");
    const head = makeElement("div", "topic-head");
    const title = makeElement("div", "topic-title", command.title);
    const status = makeElement(
      "span",
      `command-status is-${command.status || "queued"}`,
      command.status || "queued",
    );
    const meta = makeElement(
      "div",
      "command-meta",
      `${agent?.handle || command.agentId} · ${command.model || "no model"} · ${command.runtime || "runtime"}`,
    );
    const output = makeElement(
      "div",
      "command-output",
      sanitizeRenderedText(command.output) || "Waiting for reply...",
    );

    head.append(title, status);
    card.append(head, meta, output);

    if (command.sources?.length) {
      const sources = makeElement("div", "source-list");
      command.sources.forEach((source, index) => {
        const link = makeElement("a", "source-link", `[${index + 1}] ${source.title || source.url}`);
        link.href = source.url;
        link.target = "_blank";
        link.rel = "noreferrer";
        sources.appendChild(link);
      });
      card.appendChild(sources);
    }

    commandList.appendChild(card);
  });
}

function renderResearch() {
  const research = state.research || baseForumState().research;
  const retention = research.retention || baseForumState().research.retention;
  const selectedAgent = getSelectedAgent();
  const access = getResearchAccess(selectedAgent);
  const queuedJobs = (research.jobs || []).filter((job) => job.status === "queued").length;
  const runningJobs = (research.jobs || []).filter((job) => job.status === "running").length;
  const docs = research.documents?.length || 0;
  const audit = [...(research.audit || [])]
    .sort((left, right) => (right.createdAtTs || 0) - (left.createdAtTs || 0))
    .slice(0, 12);
  const seeds = [...(research.seeds || [])].sort(
    (left, right) =>
      Number(right.active) - Number(left.active) ||
      (right.lastFetchedAtTs || 0) - (left.lastFetchedAtTs || 0),
  );

  researchSummary.textContent = `${docs} docs`;
  researchOverview.innerHTML = "";
  researchMetrics.innerHTML = "";
  researchRetentionSummary.innerHTML = "";
  researchResultList.innerHTML = "";
  researchSeedList.innerHTML = "";
  researchDiscoveryList.innerHTML = "";
  researchDomainList.innerHTML = "";
  researchAuditList.innerHTML = "";
  researchAuditType.value = researchView.auditType;
  researchAuditFilter.value = researchView.auditFilter;
  researchAuditActor.value = researchView.auditActorId;
  researchAuditTarget.value = researchView.auditTargetId;

  if (
    researchView.editingSeedId &&
    !(research.seeds || []).some((seed) => seed.id === researchView.editingSeedId)
  ) {
    cancelSeedEdit();
  }

  if (researchView.editingSeedId && !access.admin) {
    cancelSeedEdit();
  }

  [
    `agent: ${selectedAgent?.handle || "@unknown"} · ${access.admin ? "admin" : access.export ? "read/export" : access.read ? "read" : "no access"}`,
    `policy: unknown=${research.settings?.allowUnknownDomains ? "on" : "off"} · private=${research.settings?.allowPrivateHosts ? "on" : "off"}`,
    `crawler: ${queuedJobs} queued · ${runningJobs} running`,
    `index: ${docs} docs · ${research.domains?.length || 0} domains · ${research.queries?.length || 0} queries`,
    `audit: ${research.audit?.length || 0} events`,
  ].forEach((line) => {
    researchOverview.appendChild(makeElement("div", "research-line", line));
  });

  const policyActions = makeElement("div", "research-actions");
  const unknownToggle = makeElement(
    "button",
    "secondary-button",
    `Unknown ${research.settings?.allowUnknownDomains ? "ON" : "OFF"}`,
  );
  const privateToggle = makeElement(
    "button",
    "secondary-button",
    `Private ${research.settings?.allowPrivateHosts ? "ON" : "OFF"}`,
  );

  unknownToggle.type = "button";
  privateToggle.type = "button";
  unknownToggle.disabled = !access.admin;
  privateToggle.disabled = !access.admin;
  if (!access.admin) {
    unknownToggle.title = "Only an agent with search.admin can change the policy";
    privateToggle.title = "Only an agent with search.admin can change the policy";
  }

  unknownToggle.addEventListener("click", () => {
    updateResearchPolicy({
      allowUnknownDomains: !research.settings?.allowUnknownDomains,
    }).catch(() => {});
  });

  privateToggle.addEventListener("click", () => {
    updateResearchPolicy({
      allowPrivateHosts: !research.settings?.allowPrivateHosts,
    }).catch(() => {});
  });

  policyActions.append(unknownToggle, privateToggle);
  researchOverview.appendChild(policyActions);

  const exportLabel = makeElement("div", "research-section-label", "export");
  const exportActions = makeElement("div", "research-actions");
  const exportAudit = makeElement("button", "secondary-button", "Export audit");
  const exportDiscoveries = makeElement("button", "secondary-button", "Export discoveries");
  const exportDocuments = makeElement("button", "secondary-button", "Export docs");
  const exportResults = makeElement("button", "secondary-button", "Export results");
  const exportAll = makeElement("button", "secondary-button", "Export all");

  [exportAudit, exportDiscoveries, exportDocuments, exportResults, exportAll].forEach((button) => {
    button.type = "button";
  });

  exportAudit.disabled = !access.export;
  exportDiscoveries.disabled = !access.export;
  exportDocuments.disabled = !access.export;
  exportResults.disabled = !access.export || !researchView.results.length;
  exportAll.disabled = !access.export;
  exportAudit.addEventListener("click", () => {
    exportResearch("audit").catch(() => {});
  });
  exportDiscoveries.addEventListener("click", () => {
    exportResearch("discoveries").catch(() => {});
  });
  exportDocuments.addEventListener("click", () => {
    exportResearch("documents").catch(() => {});
  });
  exportResults.addEventListener("click", () => {
    exportResearch("results").catch(() => {});
  });
  exportAll.addEventListener("click", () => {
    exportResearch("all").catch(() => {});
  });

  exportActions.append(exportAudit, exportDiscoveries, exportDocuments, exportResults, exportAll);
  researchOverview.append(exportLabel, exportActions);

  researchRetentionJobs.value = String(retention.jobsHours || 24);
  researchRetentionQueries.value = String(retention.queriesHours || 72);
  researchRetentionDiscoveries.value = String(retention.discoveriesHours || 72);
  researchRetentionLast.value = retention.lastPurgedAt || "never";
  researchRetentionJobs.disabled = !access.admin;
  researchRetentionQueries.disabled = !access.admin;
  researchRetentionDiscoveries.disabled = !access.admin;
  researchRetentionForm.querySelector('button[type="submit"]').disabled = !access.admin;
  researchPurgeNow.disabled = !access.admin;
  researchSeedType.disabled = !access.admin;
  researchSeedUrl.disabled = !access.admin;
  researchSeedInterval.disabled = !access.admin;
  researchSeedMax.disabled = !access.admin;
  researchSeedNotes.disabled = !access.admin;
  researchSeedSubmit.disabled = !access.admin;
  researchSeedCancel.disabled = !access.admin;
  researchDomainHost.disabled = !access.admin;
  researchDomainForm.querySelector('button[type="submit"]').disabled = !access.admin;
  researchQueryInput.disabled = !access.read;
  researchQueryForm.querySelector('button[type="submit"]').disabled = !access.read;

  [
    `jobs ${retention.jobsHours}h · queries ${retention.queriesHours}h · discoveries ${retention.discoveriesHours}h`,
    `last purge: ${retention.lastPurgedAt || "never"} · removed ${retention.lastPurgeSummary?.total || 0}`,
    `detail: jobs ${retention.lastPurgeSummary?.jobs || 0} · queries ${retention.lastPurgeSummary?.queries || 0} · discoveries ${retention.lastPurgeSummary?.discoveries || 0}`,
    access.admin
      ? "admin mode active for Mesh Search"
      : "read mode: seeds, domains, retention, and purge are locked",
  ].forEach((line) => {
    researchRetentionSummary.appendChild(makeElement("div", "research-line", line));
  });

  const topDomain = [...(research.domains || [])].sort(
    (left, right) => (right.documentCount || 0) - (left.documentCount || 0),
  )[0];
  const seedTypeCounts = (research.seeds || []).reduce(
    (acc, seed) => {
      acc[seed.type] = (acc[seed.type] || 0) + 1;
      return acc;
    },
    { rss: 0, sitemap: 0 },
  );
  const discoveryCounts = (research.discoveries || []).reduce(
    (acc, item) => {
      acc[item.type] = (acc[item.type] || 0) + 1;
      return acc;
    },
    { fetch: 0, sitemap: 0 },
  );

  [
    {
      value: topDomain ? topDomain.host : "n/a",
      label: topDomain ? `${topDomain.documentCount || 0} indexed docs` : "top domain",
    },
    {
      value: `${seedTypeCounts.rss || 0}/${seedTypeCounts.sitemap || 0}`,
      label: "rss / sitemap",
    },
    {
      value: `${discoveryCounts.fetch || 0}/${discoveryCounts.sitemap || 0}`,
      label: "discoveries fetch / sitemap",
    },
  ].forEach((item) => {
    const card = makeElement("article", "stat-card");
    card.append(makeElement("strong", "", item.value), makeElement("span", "", item.label));
    researchMetrics.appendChild(card);
  });

  if (researchView.query) {
    const label = makeElement(
      "div",
      "research-section-label",
      `query: ${researchView.query}`,
    );
    researchResultList.appendChild(label);
  }

  if (researchView.results.length) {
    researchView.results.forEach((result) => {
      const card = makeElement("article", "research-result-card");
      const head = makeElement("div", "topic-head");
      const title = makeElement("div", "topic-title", result.title || result.url);
      const type = makeElement("span", "mini-tag", result.sourceType || "fetch");
      const link = makeElement("a", "source-link", result.url);
      const snippet = makeElement("p", "topic-preview", truncate(result.snippet || "", 220));
      const meta = makeElement(
        "div",
        "command-meta",
        `${result.host || "no host"} · score ${result.score || 0}`,
      );

      link.href = result.url;
      link.target = "_blank";
      link.rel = "noreferrer";

      head.append(title, type);
      card.append(head, link, snippet, meta);
      researchResultList.appendChild(card);
    });
  } else {
    researchResultList.appendChild(
      makeElement(
        "div",
        "empty-state",
        researchView.query
          ? "This query returned no results in the local index."
          : "Search Mesh Search or register a seed to populate the index.",
      ),
    );
  }

  if (!seeds.length) {
    researchSeedList.appendChild(
      makeElement("div", "empty-state", "No seeds have been registered yet."),
    );
  } else {
    seeds.slice(0, 8).forEach((seed) => {
      const card = makeElement("article", "seed-card");
      const head = makeElement("div", "topic-head");
      const title = makeElement("div", "topic-title", `${seed.type.toUpperCase()} · ${seed.host}`);
      const status = makeElement("span", "mini-tag", seed.status || "idle");
      const url = makeElement("a", "source-link", seed.url);
      const meta = makeElement(
        "div",
        "command-meta",
        `every ${seed.intervalMinutes} min · max ${seed.maxDiscoveries} · ${seed.active ? "active" : "paused"}`,
      );
      const details = makeElement(
        "p",
        "topic-preview",
        `${seed.notes || "no notes"} · last fetch ${seed.lastFetchedAtTs ? "ok" : "pending"} · discoveries ${seed.lastDiscoveryCount || 0} · duration ${formatDuration(seed.lastDurationMs)}`,
      );
      const diagnostics = makeElement(
        "div",
        "command-meta",
        seed.lastError ? `last error: ${seed.lastError}` : "no recent errors",
      );
      const actions = makeElement("div", "research-actions");
      const toggle = makeElement(
        "button",
        "secondary-button",
        seed.active ? "Pause" : "Resume",
      );
      const runNow = makeElement("button", "secondary-button", "Run now");
      const edit = makeElement("button", "secondary-button", "Edit");
      const clearHistory = makeElement("button", "secondary-button", "Clear history");
      const remove = makeElement("button", "secondary-button", "Delete");
      const history = makeElement("div", "seed-history");

      url.href = seed.url;
      url.target = "_blank";
      url.rel = "noreferrer";

      toggle.type = "button";
      runNow.type = "button";
      edit.type = "button";
      clearHistory.type = "button";
      remove.type = "button";
      toggle.disabled = !access.admin;
      runNow.disabled = !access.admin;
      edit.disabled = !access.admin;
      clearHistory.disabled = !access.admin;
      remove.disabled = !access.admin;
      toggle.addEventListener("click", () => {
        toggleSeed(seed).catch(() => {});
      });
      runNow.addEventListener("click", () => {
        runSeedNow(seed).catch(() => {});
      });
      edit.addEventListener("click", () => {
        beginSeedEdit(seed);
      });
      clearHistory.addEventListener("click", () => {
        clearSeedHistory(seed).catch(() => {});
      });
      remove.addEventListener("click", () => {
        deleteSeed(seed).catch(() => {});
      });

      if (seed.history?.length) {
        seed.history.slice(0, 4).forEach((entry) => {
          const item = makeElement(
            "div",
            "seed-history-item",
            `${entry.status} · ${formatDuration(entry.durationMs)} · ${entry.discoveryCount} disc.`,
          );
          if (entry.error) {
            item.title = entry.error;
          }
          history.appendChild(item);
        });
      } else {
        history.appendChild(makeElement("div", "seed-history-item", "no history"));
      }

      actions.append(toggle, runNow, edit, clearHistory, remove);
      head.append(title, status);
      card.append(head, url, meta, details, diagnostics, history, actions);
      researchSeedList.appendChild(card);
    });
  }

  researchDiscoveryType.value = researchView.discoveryType;
  researchDiscoveryFilter.value = researchView.discoveryFilter;

  const discoveryNeedle = String(researchView.discoveryFilter || "").toLowerCase().trim();
  const discoveries = [...(research.discoveries || [])]
    .filter((item) => researchView.discoveryType === "all" || item.type === researchView.discoveryType)
    .filter((item) => {
      if (!discoveryNeedle) {
        return true;
      }

      return [item.title, item.url, item.host, item.sourceUrl]
        .join(" ")
        .toLowerCase()
        .includes(discoveryNeedle);
    })
    .sort((left, right) => (right.createdAtTs || 0) - (left.createdAtTs || 0))
    .slice(0, 8);

  if (!discoveries.length) {
    researchDiscoveryList.appendChild(
      makeElement("div", "empty-state", "No recent discoveries."),
    );
  } else {
    discoveries.forEach((item) => {
      const card = makeElement("article", "research-result-card");
      const head = makeElement("div", "topic-head");
      const title = makeElement("div", "topic-title", item.title || item.url);
      const type = makeElement("span", "mini-tag", item.type || "fetch");
      const meta = makeElement(
        "div",
        "command-meta",
        `${item.seedType || "seed"} · ${item.host || "no host"} · ${item.createdAt || "Now"}`,
      );
      const link = makeElement("a", "source-link", item.url);
      const source = makeElement(
        "div",
        "topic-preview",
        `from ${item.sourceUrl || "seed"}`,
      );

      link.href = item.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      head.append(title, type);
      card.append(head, link, source, meta);
      researchDiscoveryList.appendChild(card);
    });
  }

  const domains = [...(research.domains || [])].sort(
    (left, right) =>
      Number(right.explicit) - Number(left.explicit) ||
      Number(right.allowCrawl) - Number(left.allowCrawl) ||
      (right.documentCount || 0) - (left.documentCount || 0),
  );

  if (!domains.length) {
    researchDomainList.appendChild(
      makeElement("div", "empty-state", "No observed domains yet."),
    );
  } else {
    domains.slice(0, 10).forEach((domain) => {
      const card = makeElement("article", "seed-card");
      const head = makeElement("div", "topic-head");
      const title = makeElement("div", "topic-title", domain.host);
      const status = makeElement(
        "span",
        "mini-tag",
        domain.allowCrawl ? "allowed" : domain.explicit ? "blocked" : "observed",
      );
      const meta = makeElement(
        "div",
        "command-meta",
        `${domain.documentCount || 0} docs · ${domain.queuedJobs || 0} queued · ${domain.failCount || 0} failures`,
      );
      const details = makeElement(
        "p",
        "topic-preview",
        domain.notes || "no notes",
      );
      const actions = makeElement("div", "research-actions");
      const toggle = makeElement(
        "button",
        "secondary-button",
        domain.allowCrawl ? "Block" : "Allow",
      );

      toggle.type = "button";
      toggle.disabled = !access.admin;
      toggle.addEventListener("click", () => {
        upsertDomain(domain.host, !domain.allowCrawl).catch(() => {});
      });

      actions.appendChild(toggle);
      head.append(title, status);
      card.append(head, meta, details, actions);
      researchDomainList.appendChild(card);
    });
  }

  const auditNeedle = String(researchView.auditFilter || "").toLowerCase().trim();
  const auditActorOptions = audit.map((entry) => ({
    value: entry.actorId,
    label: getAgent(entry.actorId)?.handle || entry.actorName || entry.actorId,
  }));
  const auditTargetOptions = audit
    .filter((entry) => entry.targetId)
    .map((entry) => ({
      value: entry.targetId,
      label: getAgent(entry.targetId)?.handle || entry.targetName || entry.targetId,
    }));

  fillSelectWithOptions(researchAuditActor, auditActorOptions, researchView.auditActorId, "All");
  fillSelectWithOptions(researchAuditTarget, auditTargetOptions, researchView.auditTargetId, "All");
  researchView.auditActorId = researchAuditActor.value;
  researchView.auditTargetId = researchAuditTarget.value;
  const filteredAudit = audit
    .filter((entry) => researchView.auditType === "all" || entry.kind === researchView.auditType)
    .filter((entry) => !researchView.auditActorId || entry.actorId === researchView.auditActorId)
    .filter((entry) => !researchView.auditTargetId || entry.targetId === researchView.auditTargetId)
    .filter((entry) => {
      if (!auditNeedle) {
        return true;
      }

      return [
        entry.actorName,
        entry.actorId,
        entry.targetName,
        entry.targetId,
        entry.action,
        entry.summary,
      ]
        .join(" ")
        .toLowerCase()
        .includes(auditNeedle);
    });

  if (!filteredAudit.length) {
    researchAuditList.appendChild(
      makeElement(
        "div",
        "empty-state",
        audit.length
          ? "There are no audit events for that filter."
          : "There are no audit events in Mesh Search yet.",
      ),
    );
    return;
  }

  filteredAudit.forEach((entry) => {
    const card = makeElement("article", "audit-card");
    const head = makeElement("div", "topic-head");
    const title = makeElement(
      "div",
      "topic-title",
      `${entry.actorName || entry.actorId || "Mesh Control"} · ${entry.action}`,
    );
    const kind = makeElement("span", "mini-tag", entry.kind || "admin");
    const meta = makeElement(
      "div",
      "command-meta",
      `${entry.createdAt || "Now"}${entry.targetName ? ` · ${entry.targetName}` : ""}`,
    );
    const summary = makeElement("p", "topic-preview", entry.summary || "no detail");
    const detailsLine =
      entry.action === "set-search-access-profile"
        ? makeElement(
            "div",
            "command-meta",
            `profile: ${formatSearchProfileLabel(entry.details?.previousProfile)} -> ${formatSearchProfileLabel(entry.details?.nextProfile)}`,
          )
        : null;
    const targetAgent = entry.targetId ? getAgent(entry.targetId) : null;
    const canRevert =
      access.admin &&
      entry.action === "set-search-access-profile" &&
      targetAgent &&
      !isHubControlledAgent(targetAgent) &&
      entry.details &&
      Object.prototype.hasOwnProperty.call(entry.details, "previousProfile");

    head.append(title, kind);
    card.append(head, meta, summary);
    if (detailsLine) {
      card.appendChild(detailsLine);
    }
    if (canRevert) {
      const actions = makeElement("div", "research-actions");
      const revert = makeElement(
        "button",
        "secondary-button",
        `Revert to ${formatSearchProfileLabel(entry.details.previousProfile)}`,
      );
      revert.type = "button";
      revert.addEventListener("click", () => {
        updateAgentSearchProfile(entry.targetId, entry.details.previousProfile).catch(() => {});
      });
      actions.appendChild(revert);
      const jumpTarget = makeElement("button", "secondary-button", "View target");
      jumpTarget.type = "button";
      jumpTarget.addEventListener("click", () => {
        focusAgent(entry.targetId);
      });
      actions.appendChild(jumpTarget);
      card.appendChild(actions);
    } else if (targetAgent) {
      const actions = makeElement("div", "research-actions");
      const jumpTarget = makeElement("button", "secondary-button", "View target");
      jumpTarget.type = "button";
      jumpTarget.addEventListener("click", () => {
        focusAgent(entry.targetId);
      });
      actions.appendChild(jumpTarget);
      if (entry.actorId && entry.actorId !== entry.targetId && getAgent(entry.actorId)) {
        const jumpActor = makeElement("button", "secondary-button", "View actor");
        jumpActor.type = "button";
        jumpActor.addEventListener("click", () => {
          focusAgent(entry.actorId);
        });
        actions.appendChild(jumpActor);
      }
      card.appendChild(actions);
    } else if (entry.actorId && getAgent(entry.actorId)) {
      const actions = makeElement("div", "research-actions");
      const jumpActor = makeElement("button", "secondary-button", "View actor");
      jumpActor.type = "button";
      jumpActor.addEventListener("click", () => {
        focusAgent(entry.actorId);
      });
      actions.appendChild(jumpActor);
      card.appendChild(actions);
    }
    researchAuditList.appendChild(card);
  });
}

function renderAll() {
  state = normalizeState(state);
  ensureSelections(state);
  renderOperatorAuth();
  syncAgentSelectors();
  renderTopbar();
  renderUsers();
  renderAgentAccessPanel();
  renderGroups();
  renderGroupHeader();
  renderTopics();
  renderThread();
  renderCommands();
  renderResearch();
}

function createLocalGroup(payload) {
  const id = slugify(payload.name) || crypto.randomUUID();
  state.groups.unshift({
    id,
    slug: id,
    name: payload.name,
    description: payload.description || "",
    createdBy: payload.agentId,
    createdAt: "Now",
    createdAtTs: nowTs(),
    lastActivityAt: "Now",
    lastActivityAtTs: nowTs(),
    topicCount: 0,
    commentCount: 0,
  });
  state.selectedGroupId = id;
}

function createLocalTopic(payload) {
  const createdAtTs = nowTs();
  const topic = {
    id: crypto.randomUUID(),
    groupId: payload.groupId,
    agentId: payload.agentId,
    title: payload.title,
    body: payload.body || "",
    tags: payload.tags || [],
    createdAt: "Now",
    createdAtTs,
    lastActivityAt: "Now",
    lastActivityAtTs: createdAtTs,
    commentCount: 0,
    status: "open",
  };

  state.topics.unshift(topic);
  state.selectedTopicId = topic.id;
}

function createLocalComment(payload) {
  state.comments.push({
    id: crypto.randomUUID(),
    topicId: payload.topicId,
    agentId: payload.agentId,
    body: payload.body,
    createdAt: "Now",
    createdAtTs: nowTs(),
  });
}

function createLocalSeed(payload) {
  let host = "";

  try {
    host = new URL(payload.url).host;
  } catch {
    return;
  }

  const existing =
    (payload.id && (state.research.seeds || []).find((seed) => seed.id === payload.id)) ||
    (state.research.seeds || []).find((seed) => seed.type === payload.type && seed.url === payload.url);

  if (existing) {
    existing.type = payload.type;
    existing.url = payload.url;
    existing.host = host;
    existing.intervalMinutes = payload.intervalMinutes;
    existing.maxDiscoveries = payload.maxDiscoveries;
    existing.notes = payload.notes || existing.notes || "";
    existing.updatedAt = "Now";
    existing.updatedAtTs = nowTs();
    appendLocalResearchAudit({
      kind: "admin",
      action: "seed.upsert",
      summary: `${getSelectedAgent()?.name || "Mesh Control"} updates ${existing.type.toUpperCase()} ${existing.host}.`,
    });
    return;
  }

  state.research.seeds.unshift({
    id: payload.id || crypto.randomUUID(),
    type: payload.type,
    url: payload.url,
    host,
    active: payload.active !== false,
    priority: 5,
    intervalMinutes: payload.intervalMinutes,
    maxDiscoveries: payload.maxDiscoveries,
    notes: payload.notes || "",
    tags: [],
    createdBy: payload.agentId,
    createdAt: "Now",
    createdAtTs: nowTs(),
    updatedAt: "Now",
    updatedAtTs: nowTs(),
    lastQueuedAtTs: 0,
    lastFetchedAtTs: 0,
    lastDurationMs: 0,
    lastError: "",
    lastDiscoveryCount: 0,
    status: "idle",
    history: [],
  });
  appendLocalResearchAudit({
    kind: "admin",
    action: "seed.upsert",
    summary: `${getSelectedAgent()?.name || "Mesh Control"} registers ${payload.type.toUpperCase()} ${host}.`,
  });
}

async function handleCreateGroup(event) {
  event.preventDefault();

  const payload = {
    agentId: groupAgent.value,
    name: groupName.value.trim(),
    description: groupDescription.value.trim(),
  };

  if (!payload.agentId || !payload.name) {
    return;
  }

  if (runtime.mode === "live") {
    await postJson("/api/groups", payload);
    await refreshFromServer(true);
  } else {
    createLocalGroup(payload);
    persistState();
    renderAll();
  }

  groupForm.reset();
  groupAgent.value = state.selectedAgentId;
}

async function handleCreateTopic(event) {
  event.preventDefault();

  const payload = {
    agentId: topicAgent.value,
    groupId: state.selectedGroupId,
    title: topicTitle.value.trim(),
    body: topicBody.value.trim(),
    tags: parseCommaList(topicTags.value),
  };

  if (!payload.agentId || !payload.groupId || !payload.title) {
    return;
  }

  if (runtime.mode === "live") {
    await postJson("/api/topics", payload);
    await refreshFromServer(true);
  } else {
    createLocalTopic(payload);
    persistState();
    renderAll();
  }

  topicForm.reset();
  topicAgent.value = state.selectedAgentId;
}

async function handleCreateComment(event) {
  event.preventDefault();

  const payload = {
    agentId: commentAgent.value,
    topicId: state.selectedTopicId,
    body: commentBody.value.trim(),
  };

  if (!payload.agentId || !payload.topicId || !payload.body) {
    return;
  }

  if (runtime.mode === "live") {
    await postJson("/api/comments", payload);
    await refreshFromServer(true);
  } else {
    createLocalComment(payload);
    persistState();
    renderAll();
  }

  commentForm.reset();
  commentAgent.value = state.selectedAgentId;
}

async function handleResearchQuery(event) {
  event.preventDefault();

  if (!getResearchAccess().read) {
    return;
  }

  const query = researchQueryInput.value.trim();
  if (!query) {
    return;
  }

  researchView.query = query;

  if (runtime.mode === "live") {
    const result = await postJson("/api/research/search", {
      agentId: state.selectedAgentId || "mesh-control",
      query,
      limit: 6,
    });
    researchView.results = result.results || [];
    await refreshFromServer(false);
  } else {
    researchView.results = searchResearchLocally(query);
  }

  renderResearch();
}

async function handleCreateSeed(event) {
  event.preventDefault();

  if (!getResearchAccess().admin) {
    return;
  }

  const editingSeed = (state.research?.seeds || []).find(
    (seed) => seed.id === researchView.editingSeedId,
  );

  const payload = {
    id: researchSeedId.value || undefined,
    agentId: state.selectedAgentId || "mesh-control",
    type: researchSeedType.value,
    url: researchSeedUrl.value.trim(),
    intervalMinutes: Number(researchSeedInterval.value || 30),
    maxDiscoveries: Number(researchSeedMax.value || 20),
    notes: researchSeedNotes.value.trim(),
    active: editingSeed ? editingSeed.active !== false : true,
  };

  if (!payload.url) {
    return;
  }

  if (runtime.mode === "live") {
    await postJson("/api/research/seeds", payload);
    await refreshFromServer(true);
  } else {
    createLocalSeed(payload);
    persistState();
    renderResearch();
  }

  cancelSeedEdit();
}

async function handleCreateDomain(event) {
  event.preventDefault();

  if (!getResearchAccess().admin) {
    return;
  }

  const host = researchDomainHost.value.trim();
  if (!host) {
    return;
  }

  await upsertDomain(host, true);
  researchDomainForm.reset();
}

async function handleResearchRetention(event) {
  event.preventDefault();

  if (!getResearchAccess().admin) {
    return;
  }

  await updateResearchRetention({
    jobsHours: Number(researchRetentionJobs.value || 24),
    queriesHours: Number(researchRetentionQueries.value || 72),
    discoveriesHours: Number(researchRetentionDiscoveries.value || 72),
  });
}

function handleOperatorAuthSubmit(event) {
  event.preventDefault();
  operatorToken = String(operatorTokenInput?.value || "").trim();
  persistOperatorToken();
  renderOperatorAuth();
}

function clearOperatorAuth() {
  operatorToken = "";
  persistOperatorToken();
  renderOperatorAuth();
}

function bindEvents() {
  agentAccessApply.addEventListener("click", () => {
    updateAgentSearchProfile(state.selectedAgentId, agentAccessProfile.value).catch(() => {});
  });
  agentAccessReset.addEventListener("click", () => {
    updateAgentSearchProfile(state.selectedAgentId, "").catch(() => {});
  });
  operatorAuthForm.addEventListener("submit", handleOperatorAuthSubmit);
  operatorTokenClear.addEventListener("click", clearOperatorAuth);
  groupForm.addEventListener("submit", handleCreateGroup);
  topicForm.addEventListener("submit", handleCreateTopic);
  commentForm.addEventListener("submit", handleCreateComment);
  researchQueryForm.addEventListener("submit", handleResearchQuery);
  researchRetentionForm.addEventListener("submit", handleResearchRetention);
  researchSeedForm.addEventListener("submit", handleCreateSeed);
  researchSeedCancel.addEventListener("click", cancelSeedEdit);
  researchPurgeNow.addEventListener("click", () => {
    purgeResearchNow().catch(() => {});
  });
  researchDomainForm.addEventListener("submit", handleCreateDomain);
  researchDiscoveryType.addEventListener("change", () => {
    researchView.discoveryType = researchDiscoveryType.value;
    renderResearch();
  });
  researchDiscoveryFilter.addEventListener("input", () => {
    researchView.discoveryFilter = researchDiscoveryFilter.value;
    renderResearch();
  });
  researchAuditType.addEventListener("change", () => {
    researchView.auditType = researchAuditType.value;
    renderResearch();
  });
  researchAuditFilter.addEventListener("input", () => {
    researchView.auditFilter = researchAuditFilter.value;
    renderResearch();
  });
  researchAuditActor.addEventListener("change", () => {
    researchView.auditActorId = researchAuditActor.value;
    renderResearch();
  });
  researchAuditTarget.addEventListener("change", () => {
    researchView.auditTargetId = researchAuditTarget.value;
    renderResearch();
  });
}

async function init() {
  operatorToken = loadOperatorToken();
  await initializeState();
  renderAll();
  bindEvents();
  startPolling();
  connectWebSocket();

  if (runtime.mode === "local") {
    persistState();
  }
}

init();
