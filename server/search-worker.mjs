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

function stripTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function parseBoolean(value, fallback = false) {
  if (value === undefined) {
    return fallback;
  }

  return String(value).toLowerCase() === "true";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncate(value, limit = 280) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  return clean.length <= limit ? clean : `${clean.slice(0, limit - 1).trimEnd()}…`;
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripCdata(value) {
  return String(value || "").replace(/^<!\[CDATA\[|\]\]>$/g, "").trim();
}

function stripHtml(html) {
  return decodeHtmlEntities(
    String(html || "")
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitle(html, fallbackUrl) {
  const titleMatch = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return truncate(stripHtml(titleMatch?.[1] || fallbackUrl), 180);
}

function extractPlainTextTitle(text, fallbackUrl) {
  const lines = String(text || "")
    .split("\n")
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .filter(Boolean);

  return truncate(lines[0] || fallbackUrl, 180);
}

function absoluteUrl(value, baseUrl) {
  try {
    const parsed = new URL(String(value || "").trim(), String(baseUrl || "").trim() || undefined);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function extractBlocks(xml, tagName) {
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "gi");
  return Array.from(String(xml || "").matchAll(pattern), (match) => match[1] || "");
}

function extractFirstTag(xml, tagName) {
  const block = extractBlocks(xml, tagName)[0] || "";
  return stripCdata(stripHtml(block));
}

function extractAttribute(xml, tagName, attributeName) {
  const escapedTag = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedAttr = attributeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(xml || "").match(
    new RegExp(
      `<${escapedTag}(?:\\s[^>]*)?\\s${escapedAttr}=(["'])(.*?)\\1(?:\\s[^>]*)?>`,
      "i",
    ),
  );
  return stripCdata(decodeHtmlEntities(match?.[2] || ""));
}

function uniqueDiscoveries(items, limit) {
  const deduped = [];
  const seen = new Set();

  items.forEach((item) => {
    const url = String(item?.url || "").trim();

    if (!url || seen.has(url) || deduped.length >= limit) {
      return;
    }

    seen.add(url);
    deduped.push({
      url,
      type: item?.type || "fetch",
      title: truncate(String(item?.title || url), 180),
      snippet: truncate(String(item?.snippet || ""), 280),
      publishedAt: String(item?.publishedAt || ""),
    });
  });

  return deduped;
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
      ...hubHeaders(),
    },
    body: JSON.stringify(payload),
  });
}

async function getJson(url) {
  return fetchJson(url, {
    headers: {
      Accept: "application/json",
      ...hubHeaders(),
    },
  });
}

const args = parseArgs(process.argv.slice(2));
const config = {
  hubUrl: stripTrailingSlash(args.hub || process.env.HUB_URL || "http://127.0.0.1:4180"),
  hubToken: args.hubToken || process.env.MESH_HUB_TOKEN || process.env.HUB_TOKEN || "",
  workerId: args.workerId || process.env.WORKER_ID || "mesh-search-worker",
  pollMs: Number(args.pollMs || process.env.POLL_MS || 4000),
  timeoutMs: Number(args.timeoutMs || process.env.TIMEOUT_MS || 15000),
  once: parseBoolean(args.once || process.env.ONCE, false),
  userAgent: args.userAgent || process.env.USER_AGENT || "MeshSearchWorker/1.0",
};

function hubHeaders() {
  if (!config.hubToken) {
    return {};
  }

  return {
    Authorization: `Bearer ${config.hubToken}`,
  };
}

async function fetchTextResource(url, acceptHeader) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: acceptHeader,
        "User-Agent": config.userAgent,
      },
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`${url} -> ${response.status}`);
    }

    return {
      body: await response.text(),
      contentType: String(response.headers.get("content-type") || "").toLowerCase(),
      finalUrl: response.url || url,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchDocument(url) {
  const resource = await fetchTextResource(
    url,
    "text/html, text/plain, text/markdown, application/xhtml+xml",
  );

  if (
    !resource.contentType.includes("text/html") &&
    !resource.contentType.includes("text/plain") &&
    !resource.contentType.includes("text/markdown") &&
    !resource.contentType.includes("application/xhtml+xml")
  ) {
    throw new Error(`unsupported content-type: ${resource.contentType || "unknown"}`);
  }

  const isHtml =
    resource.contentType.includes("text/html") ||
    resource.contentType.includes("application/xhtml+xml");
  const contentText = truncate(isHtml ? stripHtml(resource.body) : resource.body, 20000);
  const title = isHtml
    ? extractTitle(resource.body, resource.finalUrl)
    : extractPlainTextTitle(resource.body, resource.finalUrl);

  return {
    url: resource.finalUrl,
    canonicalUrl: resource.finalUrl,
    title,
    snippet: truncate(contentText, 280),
    contentText,
    fetchedAtTs: Date.now(),
  };
}

function parseRssDiscoveries(xml, baseUrl, limit) {
  const feedTitle =
    extractFirstTag(xml, "title") ||
    extractPlainTextTitle(stripHtml(xml).slice(0, 240), baseUrl);

  const items = extractBlocks(xml, "item").map((block) => ({
    url: absoluteUrl(extractFirstTag(block, "link") || extractFirstTag(block, "guid"), baseUrl),
    type: "fetch",
    title: extractFirstTag(block, "title"),
    snippet: extractFirstTag(block, "description"),
    publishedAt: extractFirstTag(block, "pubDate"),
  }));

  const atomItems = extractBlocks(xml, "entry").map((block) => ({
    url: absoluteUrl(
      extractAttribute(block, "link", "href") || extractFirstTag(block, "id") || extractFirstTag(block, "link"),
      baseUrl,
    ),
    type: "fetch",
    title: extractFirstTag(block, "title"),
    snippet: extractFirstTag(block, "summary") || extractFirstTag(block, "content"),
    publishedAt: extractFirstTag(block, "updated") || extractFirstTag(block, "published"),
  }));

  const discoveries = uniqueDiscoveries([...items, ...atomItems], limit);

  return {
    title: truncate(feedTitle, 180),
    snippet: truncate(`Feed with ${discoveries.length} discovered entries.`, 280),
    contentText: truncate(
      `${feedTitle}\n${discoveries.map((item) => `${item.title} ${item.url}`).join("\n")}`,
      20000,
    ),
    discoveries,
  };
}

function parseSitemapDiscoveries(xml, baseUrl, limit) {
  const nestedSitemaps = extractBlocks(xml, "sitemap").map((block) => ({
    url: absoluteUrl(extractFirstTag(block, "loc"), baseUrl),
    type: "sitemap",
    title: extractFirstTag(block, "loc"),
    publishedAt: extractFirstTag(block, "lastmod"),
  }));

  const pageUrls = extractBlocks(xml, "url").map((block) => ({
    url: absoluteUrl(extractFirstTag(block, "loc"), baseUrl),
    type: "fetch",
    title: extractFirstTag(block, "loc"),
    publishedAt: extractFirstTag(block, "lastmod"),
  }));

  const discoveries = uniqueDiscoveries([...nestedSitemaps, ...pageUrls], limit);
  const pageCount = discoveries.filter((item) => item.type === "fetch").length;
  const sitemapCount = discoveries.filter((item) => item.type === "sitemap").length;

  return {
    title: truncate(`Sitemap ${baseUrl}`, 180),
    snippet: truncate(
      `Sitemap with ${pageCount} URLs and ${sitemapCount} nested sitemaps discovered.`,
      280,
    ),
    contentText: truncate(
      discoveries.map((item) => `${item.type.toUpperCase()} ${item.url}`).join("\n"),
      20000,
    ),
    discoveries,
  };
}

async function pollJob() {
  return getJson(
    `${config.hubUrl}/api/research/jobs/poll?workerId=${encodeURIComponent(config.workerId)}`,
  );
}

async function processDiscoveryJob(job) {
  const startedAt = Date.now();
  const limit = Math.max(1, Math.min(100, Number(job.payload?.maxDiscoveries || 25)));
  const resource = await fetchTextResource(
    job.url,
    "application/rss+xml, application/atom+xml, application/xml, text/xml, text/plain, */*",
  );
  const xml = String(resource.body || "");

  const parsed =
    job.type === "sitemap"
      ? parseSitemapDiscoveries(xml, resource.finalUrl, limit)
      : parseRssDiscoveries(xml, resource.finalUrl, limit);

  await postJson(`${config.hubUrl}/api/research/jobs/result`, {
    jobId: job.id,
    workerId: config.workerId,
    status: "completed",
    durationMs: Date.now() - startedAt,
    document: {
      url: resource.finalUrl,
      canonicalUrl: resource.finalUrl,
      title: parsed.title,
      snippet: parsed.snippet,
      contentText: parsed.contentText,
      sourceType: job.type,
      fetchedAtTs: Date.now(),
      tags: ["seed", job.type],
    },
    discoveries: parsed.discoveries,
  });
  process.stdout.write(`research discovery / ${job.type} / ${job.url} / ${parsed.discoveries.length}\n`);
}

async function processJob(job) {
  process.stdout.write(`research job / ${job.type} / ${job.url}\n`);
  const startedAt = Date.now();

  try {
    if (job.type === "rss" || job.type === "sitemap") {
      await processDiscoveryJob(job);
      return;
    }

    const document = await fetchDocument(job.url);
    await postJson(`${config.hubUrl}/api/research/jobs/result`, {
      jobId: job.id,
      workerId: config.workerId,
      status: "completed",
      durationMs: Date.now() - startedAt,
      document,
    });
    process.stdout.write(`research done / ${job.url}\n`);
  } catch (error) {
    await postJson(`${config.hubUrl}/api/research/jobs/result`, {
      jobId: job.id,
      workerId: config.workerId,
      status: "failed",
      durationMs: Date.now() - startedAt,
      error: error.message,
    });
    process.stderr.write(`research failed / ${job.url} / ${error.message}\n`);
  }
}

async function main() {
  do {
    try {
      const { status, data } = await pollJob();

      if (status === 204 || !data) {
        if (config.once) {
          return;
        }

        await sleep(config.pollMs);
        continue;
      }

      await processJob(data);

      if (config.once) {
        return;
      }
    } catch (error) {
      process.stderr.write(`worker loop failed / ${error.message}\n`);

      if (config.once) {
        process.exit(1);
      }

      await sleep(config.pollMs);
    }
  } while (true);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
