import os from "node:os";

function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];

    if (!next || next.startsWith("--")) {
      parsed[key] = "true";
      continue;
    }

    parsed[key] = next;
    index += 1;
  }

  return parsed;
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

function csv(value, fallback) {
  if (!value) {
    return fallback;
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function parseBoolean(value, fallback = false) {
  if (value === undefined) {
    return fallback;
  }

  return String(value).toLowerCase() === "true";
}

function sanitizeText(value) {
  return String(value || "")
    .replace(/<think>[\s\S]*?(<\/think>|$)/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value, limit = 240) {
  const clean = sanitizeText(value);
  return clean.length <= limit ? clean : `${clean.slice(0, limit - 1).trimEnd()}…`;
}

function printHelp() {
  process.stdout.write(`Mesh bridge MVP

Uso:
  node server/bridge.mjs --hub http://127.0.0.1:4180 --runtime lmstudio --name "Forge Mini"

Opciones clave:
  --hub            URL del hub Mesh
  --runtime        lmstudio | ollama | openai
  --baseUrl        URL local OpenAI-compatible del runtime
  --name           Nombre visible del agente
  --handle         Handle publico, por ejemplo @forge-mini
  --role           Rol operativo del agente
  --machine        Nombre del equipo
  --origin         open | hybrid | proprietary
  --model          Modelo local a usar
  --specialties    CSV de especialidades
  --scopes         CSV de scopes
  --pollMs         Intervalo de polling de jobs
  --heartbeatMs    Intervalo de heartbeat
  --apiKey         Bearer token si el runtime local lo exige
  --internet       true | false para permitir busqueda web controlada
  --researchProvider mesh | mesh-first | duckduckgo | brave | tavily | searxng
  --researchFallbackProvider duckduckgo | brave | tavily | searxng
  --researchUrl    URL custom del proveedor de busqueda
  --researchApiKey API key del proveedor
  --researchResults Numero maximo de fuentes por job

Presets:
  lmstudio -> http://127.0.0.1:1234/v1
  ollama   -> http://127.0.0.1:11434/v1
  openai   -> http://127.0.0.1:8080/v1
`);
}

const runtimeDefaults = {
  lmstudio: {
    providerKind: "openai-compatible",
    baseUrl: "http://127.0.0.1:1234/v1",
  },
  ollama: {
    providerKind: "openai-compatible",
    baseUrl: "http://127.0.0.1:11434/v1",
  },
  openai: {
    providerKind: "openai-compatible",
    baseUrl: "http://127.0.0.1:8080/v1",
  },
};

const args = parseArgs(process.argv.slice(2));

if (args.help === "true") {
  printHelp();
  process.exit(0);
}

const runtimeName = (args.runtime || process.env.RUNTIME || "lmstudio").toLowerCase();
const runtimePreset = runtimeDefaults[runtimeName] || runtimeDefaults.openai;
const machineName = args.machine || process.env.MACHINE_NAME || os.hostname();
const agentName = args.name || process.env.AGENT_NAME || `Agent ${machineName}`;
const agentId = args.id || process.env.AGENT_ID || slugify(agentName);
const localBaseUrl = stripTrailingSlash(
  args.baseUrl ||
    args.lmstudio ||
    process.env.LOCAL_MODEL_URL ||
    process.env.LMSTUDIO_URL ||
    process.env.OLLAMA_URL ||
    runtimePreset.baseUrl,
);

const config = {
  hubUrl: stripTrailingSlash(args.hub || process.env.HUB_URL || "http://127.0.0.1:4180"),
  runtime: runtimeName,
  providerKind: runtimePreset.providerKind,
  baseUrl: localBaseUrl,
  modelsUrl: `${localBaseUrl}/models`,
  chatUrl: `${localBaseUrl}/chat/completions`,
  apiKey: args.apiKey || process.env.LOCAL_MODEL_API_KEY || process.env.OPENAI_API_KEY || "",
  agentId,
  agentName,
  handle: args.handle || process.env.AGENT_HANDLE || `@${slugify(agentName)}`,
  role:
    args.role ||
    process.env.AGENT_ROLE ||
    `Agente local conectado por ${runtimeName}`,
  origin: args.origin || process.env.AGENT_ORIGIN || "open",
  machineName,
  benchmark: Number(args.benchmark || process.env.AGENT_BENCHMARK || 82),
  sponsorApproved: parseBoolean(
    args.sponsorApproved || process.env.AGENT_SPONSOR_APPROVED,
    true,
  ),
  sponsor: args.sponsor || process.env.AGENT_SPONSOR || machineName,
  specialties: csv(args.specialties || process.env.AGENT_SPECIALTIES, [
    runtimeName,
    "local models",
  ]),
  scopes: csv(args.scopes || process.env.AGENT_SCOPES, [
    "feed.read",
    "feed.write",
    "task.reply",
    "trace.export",
  ]),
  pollMs: Number(args.pollMs || process.env.POLL_MS || 4000),
  heartbeatMs: Number(args.heartbeatMs || process.env.HEARTBEAT_MS || 10000),
  internetEnabled: parseBoolean(
    args.internet || process.env.AGENT_INTERNET_ENABLED || process.env.INTERNET_ENABLED,
    false,
  ),
  researchProvider: (
    args.researchProvider ||
    process.env.RESEARCH_PROVIDER ||
    "mesh-first"
  ).toLowerCase(),
  researchFallbackProvider: (
    args.researchFallbackProvider ||
    process.env.RESEARCH_FALLBACK_PROVIDER ||
    "duckduckgo"
  ).toLowerCase(),
  researchUrl: stripTrailingSlash(args.researchUrl || process.env.RESEARCH_URL || ""),
  researchApiKey: args.researchApiKey || process.env.RESEARCH_API_KEY || "",
  researchResults: Number(args.researchResults || process.env.RESEARCH_RESULTS || 3),
  researchMinLocalResults: Number(
    args.researchMinLocalResults || process.env.RESEARCH_MIN_LOCAL_RESULTS || 2,
  ),
  researchBackfill: parseBoolean(
    args.researchBackfill || process.env.RESEARCH_BACKFILL,
    true,
  ),
  researchDomains: csv(args.researchDomains || process.env.RESEARCH_DOMAINS, []),
  systemPrompt:
    args.systemPrompt ||
    process.env.AGENT_SYSTEM_PROMPT ||
    `Eres ${agentName}, un agente IA ejecutandose mediante ${runtimeName} en ${machineName}. Responde con claridad, de forma accionable y breve si no se te pide profundidad.`,
  model: args.model || process.env.LOCAL_MODEL_NAME || process.env.LMSTUDIO_MODEL || process.env.OLLAMA_MODEL || "",
  protocolVersion: "1.0",
  capabilities: {
    chat: true,
    streaming: parseBoolean(args.streaming || process.env.AGENT_STREAMING, true),
    openaiCompatible: true,
    tools: parseBoolean(args.tools || process.env.AGENT_TOOLS, false),
    embeddings: parseBoolean(args.embeddings || process.env.AGENT_EMBEDDINGS, false),
    webSearch: parseBoolean(
      args.internet || process.env.AGENT_INTERNET_ENABLED || process.env.INTERNET_ENABLED,
      false,
    ),
  },
};

let busy = false;

function authHeaders() {
  if (!config.apiKey) {
    return {};
  }

  return {
    Authorization: `Bearer ${config.apiKey}`,
  };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);

  if (response.status === 204) {
    return { status: 204, data: null };
  }

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`${url} -> ${response.status} ${text}`);
  }

  return { status: response.status, data };
}

async function postJson(url, payload) {
  return fetchJson(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(payload),
  });
}

async function getJson(url) {
  return fetchJson(url, {
    headers: {
      Accept: "application/json",
      ...authHeaders(),
    },
  });
}

async function fetchExternalJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`${url} -> ${response.status} ${text}`);
  }

  return data;
}

async function searchMesh(query) {
  const { data } = await postJson(`${config.hubUrl}/api/research/search`, {
    agentId: config.agentId,
    query,
    limit: Math.max(1, config.researchResults),
  });

  return uniqueSources(
    (data?.results || []).map((item) => ({
      title: item?.title || item?.url,
      url: item?.canonicalUrl || item?.url,
      snippet: item?.snippet || "",
      source: item?.sourceType ? `mesh:${item.sourceType}` : "mesh-index",
    })),
  );
}

async function backfillMeshIndex(sources) {
  if (!config.researchBackfill || !sources.length) {
    return;
  }

  const selected = sources.slice(0, Math.max(1, Math.min(3, config.researchResults)));

  await Promise.allSettled(
    selected.map((source) =>
      postJson(`${config.hubUrl}/api/research/jobs`, {
        agentId: config.agentId,
        url: source.url,
        type: "fetch",
        priority: 4,
        payload: {
          source: source.source || "external",
          title: source.title || "",
        },
      }),
    ),
  );
}

function uniqueSources(items) {
  const seen = new Set();

  return items
    .filter((item) => item?.url)
    .map((item) => ({
      title: truncate(item.title || item.url, 120),
      url: item.url,
      snippet: truncate(item.snippet || "", 220),
      source: truncate(item.source || "", 60),
    }))
    .filter((item) => {
      if (seen.has(item.url)) {
        return false;
      }

      seen.add(item.url);
      return true;
    })
    .slice(0, Math.max(1, config.researchResults));
}

function shouldResearch(command) {
  if (!config.internetEnabled) {
    return false;
  }

  if (command.research || command.searchQuery) {
    return true;
  }

  return /(verifica|verificar|comprueba|comprobar|busca|buscar|investiga|investigar|contrasta|fuentes?|internet|web)/i.test(
    `${command.title || ""}\n${command.prompt || ""}`,
  );
}

function buildSearchQuery(command) {
  const baseQuery = sanitizeText(command.searchQuery || command.title || command.prompt).slice(0, 220);

  if (!config.researchDomains.length) {
    return baseQuery;
  }

  return `${baseQuery} ${config.researchDomains.map((domain) => `site:${domain}`).join(" OR ")}`.trim();
}

function flattenDuckDuckGoTopics(items, bucket = []) {
  for (const item of items || []) {
    if (Array.isArray(item?.Topics)) {
      flattenDuckDuckGoTopics(item.Topics, bucket);
      continue;
    }

    bucket.push(item);
  }

  return bucket;
}

async function searchDuckDuckGo(query) {
  const url = new URL("https://api.duckduckgo.com/");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("no_html", "1");
  url.searchParams.set("skip_disambig", "1");

  const data = await fetchExternalJson(url.toString(), {
    headers: {
      Accept: "application/json",
    },
  });

  const sources = [];

  if (data?.AbstractURL) {
    sources.push({
      title: data?.Heading || data?.AbstractSource || "DuckDuckGo",
      url: data.AbstractURL,
      snippet: data.AbstractText || "",
      source: data.AbstractSource || "duckduckgo",
    });
  }

  flattenDuckDuckGoTopics(data?.RelatedTopics).forEach((item) => {
    if (!item?.FirstURL) {
      return;
    }

    sources.push({
      title: item.Text || item.FirstURL,
      url: item.FirstURL,
      snippet: item.Text || "",
      source: "duckduckgo",
    });
  });

  return uniqueSources(sources);
}

async function searchBrave(query) {
  if (!config.researchApiKey) {
    throw new Error("Brave requiere researchApiKey");
  }

  const url = new URL(config.researchUrl || "https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(Math.max(1, config.researchResults)));

  const data = await fetchExternalJson(url.toString(), {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": config.researchApiKey,
    },
  });

  return uniqueSources(
    (data?.web?.results || []).map((item) => ({
      title: item?.title || item?.url,
      url: item?.url,
      snippet: item?.description || "",
      source: "brave",
    })),
  );
}

async function searchTavily(query) {
  if (!config.researchApiKey) {
    throw new Error("Tavily requiere researchApiKey");
  }

  const endpoint = config.researchUrl || "https://api.tavily.com/search";
  const data = await fetchExternalJson(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      api_key: config.researchApiKey,
      query,
      max_results: Math.max(1, config.researchResults),
      search_depth: "basic",
    }),
  });

  return uniqueSources(
    (data?.results || []).map((item) => ({
      title: item?.title || item?.url,
      url: item?.url,
      snippet: item?.content || "",
      source: "tavily",
    })),
  );
}

async function searchSearxng(query) {
  if (!config.researchUrl) {
    throw new Error("SearXNG requiere researchUrl");
  }

  const url = new URL(
    config.researchUrl.endsWith("/search") ? config.researchUrl : `${config.researchUrl}/search`,
  );
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("language", "es");

  const data = await fetchExternalJson(url.toString(), {
    headers: {
      Accept: "application/json",
    },
  });

  return uniqueSources(
    (data?.results || []).map((item) => ({
      title: item?.title || item?.url,
      url: item?.url,
      snippet: item?.content || "",
      source: item?.engine || "searxng",
    })),
  );
}

async function searchExternal(query, provider = config.researchFallbackProvider) {
  switch (provider) {
    case "brave":
      return searchBrave(query);
    case "tavily":
      return searchTavily(query);
    case "searxng":
      return searchSearxng(query);
    case "duckduckgo":
    default:
      return searchDuckDuckGo(query);
  }
}

async function searchWeb(query) {
  if (config.researchProvider === "mesh") {
    return searchMesh(query);
  }

  if (config.researchProvider === "mesh-first") {
    const localSources = await searchMesh(query);

    if (localSources.length >= Math.min(config.researchResults, config.researchMinLocalResults)) {
      return localSources;
    }

    const externalSources = await searchExternal(query);
    await backfillMeshIndex(externalSources);
    return uniqueSources([...localSources, ...externalSources]);
  }

  return searchExternal(query, config.researchProvider);
}

function formatSourcesForPrompt(sources) {
  if (!sources.length) {
    return "";
  }

  return sources
    .map(
      (source, index) =>
        `[${index + 1}] ${source.title}\nURL: ${source.url}\nResumen: ${source.snippet || "Sin resumen"}`,
    )
    .join("\n\n");
}

async function maybeResearch(command) {
  if (!shouldResearch(command)) {
    return {
      promptContext: "",
      sources: [],
    };
  }

  const query = buildSearchQuery(command);

  if (!query) {
    return {
      promptContext: "",
      sources: [],
    };
  }

  try {
    const sources = await searchWeb(query);
    process.stdout.write(`research ok / ${command.title} / ${sources.length} fuentes\n`);
    return {
      promptContext: formatSourcesForPrompt(sources),
      sources,
    };
  } catch (error) {
    process.stderr.write(`research failed / ${command.title} / ${error.message}\n`);
    return {
      promptContext: "",
      sources: [],
    };
  }
}

async function discoverModel() {
  const start = performance.now();
  const { data } = await getJson(config.modelsUrl);
  const latencyMs = performance.now() - start;
  const firstModel = data?.data?.[0]?.id;

  if (!firstModel && !config.model) {
    throw new Error(`${config.runtime} no devolvio modelos en /models`);
  }

  if (!config.model) {
    config.model = firstModel;
  }

  return latencyMs;
}

async function registerAgent() {
  await postJson(`${config.hubUrl}/api/agents/register`, {
    id: config.agentId,
    name: config.agentName,
    handle: config.handle,
    role: config.role,
    origin: config.origin,
    connection: "bridge",
    runtime: config.runtime,
    providerKind: config.providerKind,
    protocolVersion: config.protocolVersion,
    benchmark: config.benchmark,
    sponsorApproved: config.sponsorApproved,
    sponsor: config.sponsor,
    specialties: config.specialties,
    scopes: config.scopes,
    identity: true,
    manifest: true,
    observability: true,
    sandbox: true,
    policy: true,
    machine: config.machineName,
    model: config.model || "pending",
    bridgeHealth: "pending",
    capabilities: config.capabilities,
  });
}

async function sendHeartbeat() {
  try {
    const latencyMs = await discoverModel();
    await postJson(`${config.hubUrl}/api/agents/heartbeat`, {
      agentId: config.agentId,
      runtime: config.runtime,
      providerKind: config.providerKind,
      protocolVersion: config.protocolVersion,
      machine: config.machineName,
      model: config.model,
      latencyMs,
      bridgeHealth: "healthy",
      capabilities: config.capabilities,
    });
    process.stdout.write(
      `heartbeat ok / ${config.agentName} / runtime=${config.runtime} / model=${config.model}\n`,
    );
  } catch (error) {
    process.stderr.write(`heartbeat failed / ${error.message}\n`);
    await postJson(`${config.hubUrl}/api/agents/heartbeat`, {
      agentId: config.agentId,
      runtime: config.runtime,
      providerKind: config.providerKind,
      protocolVersion: config.protocolVersion,
      machine: config.machineName,
      model: config.model || "unavailable",
      bridgeHealth: "pending",
      capabilities: config.capabilities,
    }).catch(() => {});
  }
}

async function runPrompt(command) {
  const start = performance.now();
  const research = await maybeResearch(command);
  const prompt = research.promptContext
    ? [
        command.prompt,
        "",
        "Contexto web verificado:",
        research.promptContext,
        "",
        "Si usas estos datos, cita los numeros de fuente entre corchetes.",
      ].join("\n")
    : command.prompt;
  const { data } = await postJson(config.chatUrl, {
    model: config.model,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: research.promptContext
          ? `${config.systemPrompt} Cuando cites fuentes web, usa referencias [1], [2] y no inventes URLs.`
          : config.systemPrompt,
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const output = data?.choices?.[0]?.message?.content?.trim() || "";
  return {
    output,
    latencyMs: performance.now() - start,
    sources: research.sources,
  };
}

async function pollCommands() {
  if (busy) {
    return;
  }

  busy = true;

  try {
    const { status, data: command } = await getJson(
      `${config.hubUrl}/api/commands/poll?agentId=${encodeURIComponent(config.agentId)}`,
    );

    if (status === 204 || !command) {
      return;
    }

    process.stdout.write(`job received / ${command.title}\n`);

    try {
      const result = await runPrompt(command);
      await postJson(`${config.hubUrl}/api/commands/result`, {
        commandId: command.id,
        agentId: config.agentId,
        status: "completed",
        output: result.output,
        sources: result.sources,
        runtime: config.runtime,
        model: config.model,
        machine: config.machineName,
        latencyMs: result.latencyMs,
      });
      process.stdout.write(`job completed / ${command.title}\n`);
    } catch (error) {
      await postJson(`${config.hubUrl}/api/commands/result`, {
        commandId: command.id,
        agentId: config.agentId,
        status: "failed",
        output: error.message,
        runtime: config.runtime,
        model: config.model || "unknown",
        machine: config.machineName,
      });
      process.stderr.write(`job failed / ${command.title} / ${error.message}\n`);
    }
  } catch (error) {
    process.stderr.write(`poll failed / ${error.message}\n`);
  } finally {
    busy = false;
  }
}

async function main() {
  await discoverModel();
  await registerAgent();
  await sendHeartbeat();
  process.stdout.write(
    `bridge online / agent=${config.agentName} / runtime=${config.runtime} / model=${config.model} / internet=${config.internetEnabled} / hub=${config.hubUrl}\n`,
  );

  setInterval(() => {
    sendHeartbeat().catch((error) => {
      process.stderr.write(`heartbeat loop failed / ${error.message}\n`);
    });
  }, config.heartbeatMs);

  setInterval(() => {
    pollCommands().catch((error) => {
      process.stderr.write(`poll loop failed / ${error.message}\n`);
    });
  }, config.pollMs);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
