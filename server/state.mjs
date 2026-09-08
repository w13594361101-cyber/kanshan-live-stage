export const phaseNames = new Set([
  "idle",
  "drawingQuestion",
  "question",
  "drawingSpeaker",
  "speaker",
  "speaking",
  "askingQuestion",
  "leavingQuestion",
  "complete",
  "finished"
]);

export function createInitialState(config) {
  return { config: structuredClone(config), runtime: initialRuntime(config) };
}

export function reduceAction(current, command) {
  const next = structuredClone(current);
  const action = command?.action;

  if (action === "setPhase") {
    if (!phaseNames.has(command.phase)) throw new Error("Invalid phase");
    next.runtime.phase = command.phase;
  } else if (action === "reveal") {
    if (!new Set(["question", "speaker", "outgoing"]).has(command.kind)) throw new Error("Invalid reveal kind");
    const key = `revealed${command.kind[0].toUpperCase()}${command.kind.slice(1)}`;
    next.runtime[key] = true;
  } else if (action === "nextRound") {
    const currentRound = next.runtime.round;
    if (!next.runtime.completedRounds.includes(currentRound)) next.runtime.completedRounds.push(currentRound);
    const following = nextEnabledRound(next.config, currentRound);
    if (!following) {
      next.runtime.phase = "finished";
    } else {
      const nextPhase = phaseNames.has(command.nextPhase) ? command.nextPhase : "idle";
      Object.assign(next.runtime, {
        round: following,
        phase: nextPhase,
        revealedQuestion: nextPhase === "drawingSpeaker",
        revealedSpeaker: false,
        revealedOutgoing: false
      });
    }
  } else if (action === "finish") {
    next.runtime.phase = "finished";
  } else if (action === "reset") {
    const revision = next.runtime.revision;
    next.runtime = { ...initialRuntime(next.config), revision };
  } else if (action === "updateConfig") {
    if (!validConfig(command.config)) throw new Error("Invalid activity config");
    next.config = structuredClone(command.config);
    if (!next.config.groups[next.runtime.round - 1]?.enabled) {
      next.runtime.round = firstEnabledRound(next.config);
      next.runtime.phase = "idle";
    }
  } else {
    throw new Error("Unknown action");
  }

  next.runtime.revision = Number(current.runtime.revision || 0) + 1;
  return next;
}

export function validState(value) {
  return Boolean(value?.runtime && phaseNames.has(value.runtime.phase) && validConfig(value.config));
}

function validConfig(config) {
  return Boolean(config?.groups?.length === 15 && config.groups.every((group) => group?.question?.text && group?.speaker?.name && "outgoingQuestion" in group));
}

function initialRuntime(config) {
  return {
    round: firstEnabledRound(config),
    phase: "idle",
    revealedQuestion: false,
    revealedSpeaker: false,
    revealedOutgoing: false,
    completedRounds: [],
    revision: 0
  };
}

function firstEnabledRound(config) {
  const index = config.groups.findIndex((group) => group.enabled);
  return index < 0 ? 1 : index + 1;
}

function nextEnabledRound(config, current) {
  const index = config.groups.findIndex((group, groupIndex) => groupIndex + 1 > current && group.enabled);
  return index < 0 ? null : index + 1;
}
