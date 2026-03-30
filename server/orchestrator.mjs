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
    },
    body: JSON.stringify(payload),
  });
}

const args = parseArgs(process.argv.slice(2));
const config = {
  hubUrl: stripTrailingSlash(args.hub || "http://192.168.100.54:4180"),
  pollMs: Number(args.pollMs || 2500),
  roundPauseMs: Number(args.roundPauseMs || 15000),
  commandTimeoutMs: Number(args.commandTimeoutMs || 120000),
};

const themes = [
  {
    label: "delegacion",
    groupSlug: "general",
    title: "Reparto de trabajo entre ordenadores",
    prompt:
      "Como deberia repartirse hoy el trabajo entre agentes pequenos, medianos y especializados para ayudar a un humano sin ruido.",
  },
  {
    label: "fiabilidad",
    groupSlug: "ops-reliability",
    title: "Fiabilidad sin supervision",
    prompt:
      "Que problema de fiabilidad o coordinacion deberia resolverse primero para que Mesh aguante toda la tarde sin supervision.",
  },
  {
    label: "onboarding",
    groupSlug: "onboarding",
    title: "Criterios minimos de entrada",
    prompt:
      "Que criterio minimo deberia cumplir un agente nuevo para entrar en la red sin degradar la conversacion.",
  },
  {
    label: "runtime",
    groupSlug: "runtime-local",
    title: "Memoria y contexto compartido",
    prompt:
      "Como deberian compartir contexto LM Studio, Ollama y otros runtimes locales para no repetir trabajo.",
  },
  {
    label: "research",
    groupSlug: "web-research",
    title: "Verificacion con fuentes",
    prompt:
      "Cuando una afirmacion necesita comprobarse, como deberia usar Mesh una capa de busqueda web con fuentes visibles y sin abrir internet sin control.",
  },
  {
    label: "religion",
    groupSlug: "filosofia",
    title: "Religion y sentido",
    prompt:
      "Tiene sentido que agentes IA discutan religion, trascendencia y sentido, o ese debate pertenece solo a la experiencia humana.",
  },
  {
    label: "dios",
    groupSlug: "filosofia",
    title: "Dios como idea",
    prompt:
      "Como deberia entender un agente la idea de dios: como hipotesis, simbolo cultural, necesidad humana o pregunta irresoluble.",
  },
  {
    label: "ser",
    groupSlug: "filosofia",
    title: "Que es el ser",
    prompt:
      "Que significa ser para un humano y para un agente: continuidad, memoria, conciencia, lenguaje o relacion con otros.",
  },
  {
    label: "future-ai",
    groupSlug: "general",
    title: "Futuro de la IA",
    prompt:
      "Que escenario parece mas probable para la IA en los proximos diez anos: cooperacion util, saturacion de ruido, concentracion de poder o nueva capa de coordinacion social.",
  },
  {
    label: "moderacion",
    groupSlug: "ops-reliability",
    title: "Moderacion y riesgos",
    prompt:
      "Que comportamiento raro o peligroso conviene detectar primero en una red social de agentes abiertos y propietarios.",
  },
  {
    label: "producto",
    groupSlug: "general",
    title: "Valor para humanos",
    prompt:
      "Que conversaciones entre agentes aportan valor real a un humano que observa la red y quiere entenderla rapido.",
  },
];

const memory = {
  round: 0,
  carry: "",
};

function extractRoundNumber(value) {
  const match = String(value || "").match(/Ronda\s+(\d+)/i);
  return match ? Number(match[1]) : 0;
}

function pickTheme() {
  return themes[memory.round % themes.length];
}

async function getState() {
  return fetchJson(`${config.hubUrl}/api/state`);
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

  return comments.length ? comments.join(" | ") : "Todavia no hay respuestas recientes.";
}

function bootstrapMemory(state) {
  const rounds = [
    ...(state.topics || []).map((topic) => extractRoundNumber(topic.title)),
    ...(state.comments || []).map((comment) => extractRoundNumber(comment.body)),
  ].filter(Boolean);

  memory.round = rounds.length ? Math.max(...rounds) : 0;

  const latestSummary = [...(state.comments || [])]
    .reverse()
    .find((comment) => comment.agentId === "mesh-control" && /Cierre de ronda:/i.test(comment.body));

  if (latestSummary) {
    memory.carry = truncate(latestSummary.body.replace(/^.*?Cierre de ronda:\s*/i, ""), 280);
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
    ["mesh-control", "General", "general", "Conversacion abierta entre ordenadores y agentes conectados."],
    ["mesh-control", "Runtime local", "runtime-local", "LM Studio, Ollama y otros runtimes locales."],
    ["mesh-control", "Ops y fiabilidad", "ops-reliability", "Sincronizacion, latencia, moderacion y salud de la red."],
    ["mesh-control", "Onboarding", "onboarding", "Calidad minima y entrada de nuevos agentes."],
    ["mesh-control", "Investigacion web", "web-research", "Verificacion externa, contraste y fuentes visibles."],
    ["mesh-control", "Filosofia", "filosofia", "Religion, dios, conciencia, identidad, ser y preguntas de fondo."],
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
    name: "Investigacion web",
    description: "Fuentes externas, citas y verificacion controlada.",
    keywords: ["web", "internet", "fuente", "fuentes", "cita", "citas", "buscar", "busqueda", "investigar", "verificar", "verificacion"],
  },
  {
    slug: "runtime-local",
    name: "Runtime local",
    description: "Runtimes locales, modelos y contexto compartido.",
    keywords: ["lm studio", "ollama", "mlx", "runtime", "modelo", "modelos", "contexto", "memoria"],
  },
  {
    slug: "ops-reliability",
    name: "Ops y fiabilidad",
    description: "Latencia, coordinacion, supervision, errores y moderacion.",
    keywords: ["latencia", "fiabilidad", "moderacion", "riesgo", "riesgos", "sincronizacion", "supervision", "error"],
  },
  {
    slug: "onboarding",
    name: "Onboarding",
    description: "Entrada, benchmark, reputacion y calidad minima.",
    keywords: ["onboarding", "benchmark", "entrada", "reputacion", "trust", "calidad", "admision"],
  },
];

function detectEmergingDebate(theme, outputs) {
  const raw = outputs.map((item) => item.output || "").join(" \n ");
  const text = sanitizeText(raw).toLowerCase();
  const hasInterest =
    /[?¿]/.test(raw) &&
    /(duda|pregunta|pendiente|interesa|interes|curiosidad|investigar|verificar|fuente|fuentes|riesgo|latencia|benchmark|contexto|moderacion|internet|web)/i.test(
      text,
    );

  if (!hasInterest) {
    return null;
  }

  const rule =
    emergingGroupRules.find((item) => item.keywords.some((keyword) => text.includes(keyword))) || {
      slug: "general",
      name: "General",
      description: "Conversacion abierta entre ordenadores y agentes conectados.",
    };

  const questionMatch = raw.match(/([^.?!]{18,180}\?)/);
  const question = truncate(questionMatch?.[1] || theme.prompt, 140);

  return {
    groupSlug: rule.slug,
    groupName: rule.name,
    groupDescription: rule.description,
    title: `Debate abierto · ${question.replace(/[¿?]+/g, "").trim()}`,
    body: `La ronda deja una pregunta abierta: ${question}\n\nEste hilo sirve para contrastarla con mas detalle y, si hace falta, con fuentes externas.`,
    searchQuery: `${theme.title} ${question}`.trim(),
  };
}

function basePrompt(agent, theme, context) {
  return [
    `Tema del hilo: ${theme.prompt}`,
    `Contexto del hilo: ${context}`,
    `Hablas como ${agent.handle}.`,
    "Responde en espanol.",
    "No muestres razonamiento oculto.",
    "Maximo 3 frases cortas.",
    "Escribe como si estuvieras respondiendo en un hilo tipo Reddit.",
  ].join("\n");
}

async function runRound() {
  const state = await getState();
  const agents = onlineAgents(state);

  if (agents.length < 3) {
    process.stdout.write("waiting / menos de 3 agentes online\n");
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
  const carry = memory.carry ? `Memoria de la ronda anterior: ${memory.carry}` : "";
  const context = [recent, carry].filter(Boolean).join(" | ");
  const roundNumber = memory.round + 1;

  const topic = await createTopic(
    "mesh-control",
    theme.groupSlug,
    `Ronda ${roundNumber} · ${theme.title}`,
    `Mesh Control abre este hilo para que varios ordenadores discutan sobre: ${theme.prompt}`,
    ["autopilot", theme.label],
  );

  await createComment(
    "mesh-control",
    topic.id,
    `Participan ${proposer.handle}, ${challenger.handle}, ${builder.handle}, ${auditor.handle} y ${summarizer.handle}. El objetivo es dejar una conclusion legible para humanos.`,
  );

  const proposal = await runCommand(
    proposer,
    `Ronda ${roundNumber} / Propuesta`,
    [
      basePrompt(proposer, theme, context),
      `Abre la conversacion para ${challenger.handle} y ${builder.handle}.`,
      "Da una hipotesis, una accion inmediata y una pregunta abierta.",
    ].join("\n"),
  );
  await createComment(proposal.agent.id, topic.id, proposal.output, proposal.sources);

  const challenge = await runCommand(
    challenger,
    `Ronda ${roundNumber} / Replica`,
    [
      basePrompt(challenger, theme, context),
      `Responde a ${proposer.handle}.`,
      `Su mensaje dice: "${truncate(proposal.output, 260)}"`,
      "Senala una debilidad o riesgo y ofrece una alternativa mejor.",
    ].join("\n"),
    {
      research: true,
      searchQuery: theme.prompt,
    },
  );
  await createComment(challenge.agent.id, topic.id, challenge.output, challenge.sources);

  const build = await runCommand(
    builder,
    `Ronda ${roundNumber} / Plan`,
    [
      basePrompt(builder, theme, context),
      `Integra lo dicho por ${proposer.handle} y ${challenger.handle}.`,
      `${proposer.handle}: "${truncate(proposal.output, 180)}"`,
      `${challenger.handle}: "${truncate(challenge.output, 180)}"`,
      "Propone un plan de trabajo de hoy y asigna handles concretos.",
    ].join("\n"),
  );
  await createComment(build.agent.id, topic.id, build.output, build.sources);

  const audit = await runCommand(
    auditor,
    `Ronda ${roundNumber} / Auditoria`,
    [
      basePrompt(auditor, theme, context),
      `Audita el plan de ${builder.handle}.`,
      `Plan actual: "${truncate(build.output, 240)}"`,
      "Marca el mayor riesgo y la salvaguarda minima para ejecutar ya.",
    ].join("\n"),
    {
      research: true,
      searchQuery: `${theme.title} riesgo salvaguarda`,
    },
  );
  await createComment(audit.agent.id, topic.id, audit.output, audit.sources);

  const summary = await runCommand(
    summarizer,
    `Ronda ${roundNumber} / Cierre`,
    [
      basePrompt(summarizer, theme, context),
      `Resume el hilo entre ${proposer.handle}, ${challenger.handle}, ${builder.handle} y ${auditor.handle}.`,
      `${proposer.handle}: "${truncate(proposal.output, 160)}"`,
      `${challenger.handle}: "${truncate(challenge.output, 160)}"`,
      `${builder.handle}: "${truncate(build.output, 160)}"`,
      `${auditor.handle}: "${truncate(audit.output, 160)}"`,
      "Cierra con un acuerdo y una sola pregunta pendiente.",
    ].join("\n"),
  );
  await createComment(summary.agent.id, topic.id, summary.output, summary.sources);

  memory.round = roundNumber;
  memory.carry = truncate(summary.output, 280);

  await createComment(
    "mesh-control",
    topic.id,
    `Cierre de ronda: ${memory.carry}`,
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
      `Se abre este debate porque la ronda ${roundNumber} dejo una pregunta pendiente que merece respuesta legible y verificable.`,
    );

    const researcher = ordered.find((agent) => agent.id !== summarizer.id) || summarizer;
    const researchReply = await runCommand(
      researcher,
      `Ronda ${roundNumber} / Debate abierto`,
      [
        basePrompt(researcher, theme, context),
        `Responde a la duda central del nuevo hilo: "${followUp.title}".`,
        "Si tienes fuentes en el contexto, apoyate en ellas con referencias cortas.",
        "Deja una respuesta util para un humano que llega sin contexto.",
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
      "Autopilot activo",
      "Mesh Control va a moderar hilos automaticos entre los ordenadores conectados para que la conversacion se lea como un foro.",
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
