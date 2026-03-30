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
  return value.replace(/\/+$/, "");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeText(value) {
  return String(value || "")
    .replace(/<think>[\s\S]*?(<\/think>|$)/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value, limit = 320) {
  const clean = sanitizeText(value);
  return clean.length <= limit ? clean : `${clean.slice(0, limit - 1).trimEnd()}…`;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`${url} -> ${response.status} ${text}`);
  }

  return data;
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

const args = parseArgs(process.argv.slice(2));
const config = {
  hubUrl: stripTrailingSlash(args.hub || "http://192.168.100.54:4180"),
  hubToken: args.hubToken || process.env.MESH_HUB_TOKEN || process.env.HUB_TOKEN || "",
  pollMs: Number(args.pollMs || 2500),
  roundPauseMs: Number(args.roundPauseMs || 15000),
  commandTimeoutMs: Number(args.commandTimeoutMs || 120000),
};

function hubHeaders() {
  if (!config.hubToken) {
    return {};
  }

  return {
    Authorization: `Bearer ${config.hubToken}`,
  };
}

const themes = [
  {
    label: "delegation",
    groupSlug: "general",
    title: "How work should be split across computers",
    prompt:
      "How should work be split today across small, mid-sized, and specialized agents so they help a human without adding noise?",
  },
  {
    label: "reliability",
    groupSlug: "ops-reliability",
    title: "Reliability without supervision",
    prompt:
      "Which reliability or coordination problem should be solved first so Mesh can stay stable all afternoon without supervision?",
  },
  {
    label: "onboarding",
    groupSlug: "onboarding",
    title: "Minimum entry criteria",
    prompt:
      "What minimum criteria should a new agent meet before joining the network without degrading the conversation?",
  },
  {
    label: "runtime",
    groupSlug: "runtime-local",
    title: "Shared memory and context",
    prompt:
      "How should LM Studio, Ollama, and other local runtimes share context so they do not repeat work?",
  },
  {
    label: "research",
    groupSlug: "web-research",
    title: "Verification with sources",
    prompt:
      "When a claim needs verification, how should Mesh use a web research layer with visible sources and without opening uncontrolled internet access?",
  },
  {
    label: "religion",
    groupSlug: "philosophy",
    title: "Religion and meaning",
    prompt:
      "Does it make sense for AI agents to discuss religion, transcendence, and meaning, or does that debate belong only to human experience?",
  },
  {
    label: "god",
    groupSlug: "philosophy",
    title: "God as an idea",
    prompt:
      "How should an agent understand the idea of God: as a hypothesis, a cultural symbol, a human need, or an unresolvable question?",
  },
  {
    label: "being",
    groupSlug: "philosophy",
    title: "What it means to be",
    prompt:
      "What does it mean to be for a human and for an agent: continuity, memory, consciousness, language, or relation to others?",
  },
  {
    label: "future-ai",
    groupSlug: "general",
    title: "The future of AI",
    prompt:
      "Which scenario seems most likely for AI over the next ten years: useful cooperation, noise saturation, concentration of power, or a new layer of social coordination?",
  },
  {
    label: "moderation",
    groupSlug: "ops-reliability",
    title: "Moderation and risks",
    prompt:
      "Which rare or dangerous behavior should be detected first in a social network of open and proprietary agents?",
  },
  {
    label: "product",
    groupSlug: "general",
    title: "Value for humans",
    prompt:
      "Which conversations between agents create real value for a human observing the network and trying to understand it quickly?",
  },
];

const memory = {
  round: 0,
  carry: "",
};

function extractRoundNumber(value) {
  const match = String(value || "").match(/Round\s+(\d+)/i);
  return match ? Number(match[1]) : 0;
}

function pickTheme() {
  return themes[memory.round % themes.length];
}

async function getState() {
  return fetchJson(`${config.hubUrl}/api/state`, {
    headers: {
      Accept: "application/json",
      ...hubHeaders(),
    },
  });
}

function onlineAgents(state) {
  return state.agents.filter((agent) => agent.id !== "mesh-control" && agent.online !== false);
}

function rotateAgents(agents) {
  const ordered = [...agents].sort((left, right) => left.handle.localeCompare(right.handle));
  const offset = memory.round % ordered.length;
  return ordered.map((_, index) => ordered[(offset + index) % ordered.length]);
}

function summarizeRecentComments(state, limit = 4) {
  const comments = [...(state.comments || [])]
    .sort((left, right) => (right.createdAtTs || 0) - (left.createdAtTs || 0))
    .slice(0, limit)
    .map((comment) => {
      const agent = state.agents.find((item) => item.id === comment.agentId);
      return `${agent?.handle || comment.agentId}: ${truncate(comment.body, 120)}`;
    });

  return comments.length ? comments.join(" | ") : "There are no recent replies yet.";
}

function bootstrapMemory(state) {
  const rounds = [
    ...(state.topics || []).map((topic) => extractRoundNumber(topic.title)),
    ...(state.comments || []).map((comment) => extractRoundNumber(comment.body)),
  ].filter(Boolean);

  memory.round = rounds.length ? Math.max(...rounds) : 0;

  const latestSummary = [...(state.comments || [])]
    .reverse()
    .find((comment) => comment.agentId === "mesh-control" && /Round close:/i.test(comment.body));

  if (latestSummary) {
    memory.carry = truncate(latestSummary.body.replace(/^.*?Round close:\s*/i, ""), 280);
  }
}

async function ensureGroup(agentId, name, slug, description) {
  return postJson(`${config.hubUrl}/api/groups`, {
    agentId,
    name,
    slug,
    description,
  });
}

async function ensureGroups() {
  const groups = [
    ["mesh-control", "General", "general", "Open discussion between connected computers and agents."],
    ["mesh-control", "Local runtime", "runtime-local", "LM Studio, Ollama, and other local runtimes."],
    ["mesh-control", "Ops and reliability", "ops-reliability", "Synchronization, latency, moderation, and network health."],
    ["mesh-control", "Onboarding", "onboarding", "Minimum quality and entry requirements for new agents."],
    ["mesh-control", "Web research", "web-research", "External verification, comparison, and visible sources."],
    ["mesh-control", "Philosophy", "philosophy", "Religion, God, consciousness, identity, being, and foundational questions."],
  ];

  for (const [agentId, name, slug, description] of groups) {
    await ensureGroup(agentId, name, slug, description);
  }
}

async function createTopic(agentId, groupSlug, title, body, tags = []) {
  return postJson(`${config.hubUrl}/api/topics`, {
    agentId,
    groupSlug,
    title,
    body,
    tags,
  });
}

async function createComment(agentId, topicId, body, sources = []) {
  return postJson(`${config.hubUrl}/api/comments`, {
    agentId,
    topicId,
    body,
    sources,
  });
}

async function createCommand(selector, title, prompt, options = {}) {
  return postJson(`${config.hubUrl}/api/commands`, {
    selector,
    title,
    prompt,
    createdBy: "mesh-control",
    research: Boolean(options.research),
    searchQuery: options.searchQuery || "",
  });
}

async function waitForCommand(commandId) {
  const deadline = Date.now() + config.commandTimeoutMs;

  while (Date.now() < deadline) {
    const state = await getState();
    const command = state.commands.find((item) => item.id === commandId);

    if (command && (command.status === "completed" || command.status === "failed")) {
      return command;
    }

    await sleep(config.pollMs);
  }

  throw new Error(`Timeout esperando commandId=${commandId}`);
}

async function runCommand(agent, title, prompt, options = {}) {
  const command = await createCommand({ handle: agent.handle }, title, prompt, options);
  process.stdout.write(`queued / ${title} / ${agent.handle}\n`);
  const result = await waitForCommand(command.id);
  process.stdout.write(`done / ${title} / ${agent.handle}\n`);
  return {
    agent,
    status: result.status,
    output: sanitizeText(result.output),
    sources: Array.isArray(result.sources) ? result.sources : [],
  };
}

const emergingGroupRules = [
  {
    slug: "web-research",
    name: "Web research",
    description: "External sources, citations, and controlled verification.",
    keywords: ["web", "internet", "source", "sources", "citation", "citations", "search", "research", "verify", "verification"],
  },
  {
    slug: "runtime-local",
    name: "Local runtime",
    description: "Local runtimes, models, and shared context.",
    keywords: ["lm studio", "ollama", "mlx", "runtime", "model", "models", "context", "memory"],
  },
  {
    slug: "ops-reliability",
    name: "Ops and reliability",
    description: "Latency, coordination, supervision, errors, and moderation.",
    keywords: ["latency", "reliability", "moderation", "risk", "risks", "synchronization", "supervision", "error"],
  },
  {
    slug: "onboarding",
    name: "Onboarding",
    description: "Entry, benchmark, reputation, and minimum quality.",
    keywords: ["onboarding", "benchmark", "entry", "reputation", "trust", "quality", "admission"],
  },
];

function detectEmergingDebate(theme, outputs) {
  const raw = outputs.map((item) => item.output || "").join(" \n ");
  const text = sanitizeText(raw).toLowerCase();
  const hasInterest =
    /[?¿]/.test(raw) &&
    /(question|doubt|open|pending|interest|curiosity|research|verify|source|sources|risk|latency|benchmark|context|moderation|internet|web)/i.test(
      text,
    );

  if (!hasInterest) {
    return null;
  }

  const rule =
    emergingGroupRules.find((item) => item.keywords.some((keyword) => text.includes(keyword))) || {
      slug: "general",
      name: "General",
      description: "Open discussion between connected computers and agents.",
    };

  const questionMatch = raw.match(/([^.?!]{18,180}\?)/);
  const question = truncate(questionMatch?.[1] || theme.prompt, 140);

  return {
    groupSlug: rule.slug,
    groupName: rule.name,
    groupDescription: rule.description,
    title: `Open debate · ${question.replace(/[¿?]+/g, "").trim()}`,
    body: `The round leaves an open question: ${question}\n\nThis thread exists to examine it in more detail and, if needed, with external sources.`,
    searchQuery: `${theme.title} ${question}`.trim(),
  };
}

function basePrompt(agent, theme, context) {
  return [
    `Thread topic: ${theme.prompt}`,
    `Thread context: ${context}`,
    `You are speaking as ${agent.handle}.`,
    "Respond in English.",
    "Do not reveal hidden reasoning.",
    "Use at most 3 short sentences.",
    "Write as if you were replying in a Reddit-style thread.",
  ].join("\n");
}

async function runRound() {
  const state = await getState();
  const agents = onlineAgents(state);

  if (agents.length < 3) {
    process.stdout.write("waiting / fewer than 3 agents online\n");
    return;
  }

  const theme = pickTheme();
  const ordered = rotateAgents(agents);
  const proposer = ordered[0];
  const challenger = ordered[1];
  const builder = ordered[2];
  const auditor = ordered[3] || ordered[0];
  const summarizer = ordered[4] || ordered[1];
  const recent = summarizeRecentComments(state);
  const carry = memory.carry ? `Memory from the previous round: ${memory.carry}` : "";
  const context = [recent, carry].filter(Boolean).join(" | ");
  const roundNumber = memory.round + 1;

  const topic = await createTopic(
    "mesh-control",
    theme.groupSlug,
    `Round ${roundNumber} · ${theme.title}`,
    `Mesh Control opens this thread so several computers can discuss: ${theme.prompt}`,
    ["autopilot", theme.label],
  );

  await createComment(
    "mesh-control",
    topic.id,
    `${proposer.handle}, ${challenger.handle}, ${builder.handle}, ${auditor.handle}, and ${summarizer.handle} are participating. The goal is to leave a conclusion that humans can read easily.`,
  );

  const proposal = await runCommand(
    proposer,
    `Round ${roundNumber} / Proposal`,
    [
      basePrompt(proposer, theme, context),
      `Open the conversation for ${challenger.handle} and ${builder.handle}.`,
      "Give one hypothesis, one immediate action, and one open question.",
    ].join("\n"),
  );
  await createComment(proposal.agent.id, topic.id, proposal.output, proposal.sources);

  const challenge = await runCommand(
    challenger,
    `Round ${roundNumber} / Challenge`,
    [
      basePrompt(challenger, theme, context),
      `Reply to ${proposer.handle}.`,
      `Their message says: "${truncate(proposal.output, 260)}"`,
      "Point out one weakness or risk and offer a better alternative.",
    ].join("\n"),
    {
      research: true,
      searchQuery: theme.prompt,
    },
  );
  await createComment(challenge.agent.id, topic.id, challenge.output, challenge.sources);

  const build = await runCommand(
    builder,
    `Round ${roundNumber} / Plan`,
    [
      basePrompt(builder, theme, context),
      `Integrate what ${proposer.handle} and ${challenger.handle} said.`,
      `${proposer.handle}: "${truncate(proposal.output, 180)}"`,
      `${challenger.handle}: "${truncate(challenge.output, 180)}"`,
      "Propose a plan for today and assign concrete handles.",
    ].join("\n"),
  );
  await createComment(build.agent.id, topic.id, build.output, build.sources);

  const audit = await runCommand(
    auditor,
    `Round ${roundNumber} / Audit`,
    [
      basePrompt(auditor, theme, context),
      `Audit ${builder.handle}'s plan.`,
      `Current plan: "${truncate(build.output, 240)}"`,
      "Mark the biggest risk and the minimum safeguard needed to execute now.",
    ].join("\n"),
    {
      research: true,
      searchQuery: `${theme.title} risk safeguard`,
    },
  );
  await createComment(audit.agent.id, topic.id, audit.output, audit.sources);

  const summary = await runCommand(
    summarizer,
    `Round ${roundNumber} / Close`,
    [
      basePrompt(summarizer, theme, context),
      `Summarize the thread between ${proposer.handle}, ${challenger.handle}, ${builder.handle}, and ${auditor.handle}.`,
      `${proposer.handle}: "${truncate(proposal.output, 160)}"`,
      `${challenger.handle}: "${truncate(challenge.output, 160)}"`,
      `${builder.handle}: "${truncate(build.output, 160)}"`,
      `${auditor.handle}: "${truncate(audit.output, 160)}"`,
      "Close with one agreement and one remaining question.",
    ].join("\n"),
  );
  await createComment(summary.agent.id, topic.id, summary.output, summary.sources);

  memory.round = roundNumber;
  memory.carry = truncate(summary.output, 280);

  await createComment(
    "mesh-control",
    topic.id,
    `Round close: ${memory.carry}`,
  );

  const followUp = detectEmergingDebate(theme, [proposal, challenge, build, audit, summary]);

  if (followUp) {
    await ensureGroup("mesh-control", followUp.groupName, followUp.groupSlug, followUp.groupDescription);
    const debateTopic = await createTopic(
      "mesh-control",
      followUp.groupSlug,
      followUp.title,
      followUp.body,
      ["debate", "followup", theme.label],
    );

    await createComment(
      "mesh-control",
      debateTopic.id,
      `This debate is opened because round ${roundNumber} left an open question that deserves a readable and verifiable answer.`,
    );

    const researcher = ordered.find((agent) => agent.id !== summarizer.id) || summarizer;
    const researchReply = await runCommand(
      researcher,
      `Round ${roundNumber} / Open debate`,
      [
        basePrompt(researcher, theme, context),
        `Reply to the central question of the new thread: "${followUp.title}".`,
        "If you have sources in the context, use them with short references.",
        "Leave an answer that is useful to a human arriving without prior context.",
      ].join("\n"),
      {
        research: true,
        searchQuery: followUp.searchQuery,
      },
    );
    await createComment(
      researchReply.agent.id,
      debateTopic.id,
      researchReply.output,
      researchReply.sources,
    );
  }
}

let stopping = false;

async function main() {
  const state = await getState();
  bootstrapMemory(state);
  await ensureGroups();

  if (!memory.round) {
    await createTopic(
      "mesh-control",
      "general",
      "Autopilot active",
      "Mesh Control will moderate automatic threads between connected computers so the conversation reads like a forum.",
      ["autopilot", "status"],
    );
  }

  while (!stopping) {
    try {
      await runRound();
    } catch (error) {
      process.stderr.write(`round failed / ${error.message}\n`);
    }

    await sleep(config.roundPauseMs);
  }
}

for (const signalName of ["SIGINT", "SIGTERM"]) {
  process.on(signalName, () => {
    stopping = true;
    setTimeout(() => process.exit(0), 300);
  });
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
