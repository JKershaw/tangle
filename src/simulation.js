// The offline demonstration. Responses and evidence paragraphs were authored in
// advance; they are neither model output nor captured Wikipedia pages. The
// episode runner treats them exactly like live responses, so the same validator
// and mutation code runs in both modes.

export const SIMULATION_SEED = "Why does the water cycle keep going?";
export const PRESETS = Object.freeze(["revisit", "blocked", "repeat"]);
const REPEATED_QUESTION = "How does water move?";

const QUESTIONS = {
  root: SIMULATION_SEED,
  rise: "How does water enter the atmosphere?",
  cloud: "How do clouds form and release water?",
  return: "How does water return to the sea?",
  evap: "What drives evaporation?",
  plant: "What is transpiration?",
  cond: "Why does water vapour condense?",
  rain: "When does a cloud produce rain?",
  energy: "What supplies the energy for the cycle?",
};

// key -> [fixture title, fixture text, scripted finding]
const FIXTURES = {
  evap: [
    "Evaporation",
    "Energy allows liquid water molecules to enter the gas phase. Water can evaporate below its boiling point.",
    "Liquid water becomes water vapour when molecules gain enough energy.",
  ],
  plant: [
    "Transpiration",
    "Plants release water vapour, mainly through openings called stomata in their leaves.",
    "Plants add water vapour to the atmosphere through transpiration.",
  ],
  cond: [
    "Condensation",
    "As air cools, its capacity to contain water vapour decreases. Water may condense onto small particles as droplets.",
    "Cooling moist air can produce cloud droplets by condensation.",
  ],
  rain: [
    "Precipitation",
    "Droplets or ice particles in clouds can grow. When they fall to the ground, they become precipitation.",
    "Cloud particles grow and fall as precipitation.",
  ],
  return: [
    "Runoff and groundwater",
    "Water travels over land in streams and rivers or passes through soil and groundwater. Some of it returns to the ocean.",
    "Runoff, rivers and groundwater carry water towards the sea.",
  ],
  energy: [
    "Energy in the water cycle",
    "Solar energy powers much evaporation. Gravity drives falling precipitation and downhill flows.",
    "Solar energy and gravity keep water moving between reservoirs.",
  ],
};

const PARENT_FINDINGS = {
  rise: "Evaporation and plant transpiration supply atmospheric water vapour.",
  cloud: "Cooling forms droplets or ice; their growth leads to precipitation.",
  root: "Water cycles through evaporation, transpiration, condensation, precipitation and return flows. Solar energy and gravity sustain this movement.",
};

export function scriptedResponse(run, node, preset = "revisit") {
  const key = Object.keys(QUESTIONS).find((candidate) => QUESTIONS[candidate] === node.question) || "repeat";
  const kids = run.nodes.filter((candidate) => candidate.parent === node.id);
  if (preset === "repeat" && node.question === REPEATED_QUESTION) {
    return { action: "decompose", questions: [REPEATED_QUESTION] };
  }
  if (key === "root" && !kids.length) {
    return {
      action: "decompose",
      questions: preset === "repeat" ? [REPEATED_QUESTION] : [QUESTIONS.rise, QUESTIONS.cloud, QUESTIONS.return],
    };
  }
  if (key === "rise" && !kids.length) return { action: "decompose", questions: [QUESTIONS.evap, QUESTIONS.plant] };
  if (key === "cloud" && !kids.length) return { action: "decompose", questions: [QUESTIONS.cond, QUESTIONS.rain] };
  if (key === "root" && preset === "revisit" && !kids.some((child) => child.question === QUESTIONS.energy)) {
    return { action: "decompose", questions: [QUESTIONS.energy] };
  }
  if (key === "rain" && preset === "blocked") {
    return {
      action: "blocked",
      reason: "Simulation: the source could not be read. This is not a claim about a real network failure.",
    };
  }
  if (FIXTURES[key] && !node.observed.length) return { action: "wiki", query: FIXTURES[key][0] };
  const evidence = [...new Set([...node.observed, ...kids.flatMap((child) => child.evidence)])].slice(-5);
  return { action: "resolved", finding: FIXTURES[key]?.[2] || PARENT_FINDINGS[key], evidence };
}

export function fixtureLookup(query) {
  const fixture = Object.values(FIXTURES).find(([title]) => title === query);
  if (!fixture) return { ok: false, error: { kind: "no_match", message: `No fixture matches "${query}".` } };
  return { ok: true, kind: "fixture", title: fixture[0], text: fixture[1] };
}

// Drivers with the same shape the live mode uses, so runEpisode needs no mode branch.
export function simulationDrivers(preset = "revisit") {
  return {
    generate: async (messages, { run, node }) => ({ text: JSON.stringify(scriptedResponse(run, node, preset)), tokens: null }),
    wiki: async (query) => fixtureLookup(query),
  };
}
