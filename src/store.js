const STORAGE_KEY = "kanshan-live-stage-v8";
const CHANNEL_NAME = "kanshan-live-stage-v8";

export const phases = {
  idle: { eyebrow: "问题接力即将开始", title: "Hi～我是刘看山，接下来和我一起进入问题接力。", hint: "一位嘉宾回答上一位留下的问题，再把一个新问题交给下一位嘉宾。" },
  drawingQuestion: { eyebrow: "接力问题即将揭晓", title: "正在打开上一位留下的问题……", hint: "每一个回答，都从另一个人的问题开始" },
  question: { eyebrow: "本轮接力问题", title: "这个问题，交给下一位回答", hint: "接下来，有请本轮嘉宾上台" },
  drawingSpeaker: { eyebrow: "回答嘉宾即将登场", title: "正在邀请接住问题的嘉宾……", hint: "问题正在现场继续向前" },
  speaker: { eyebrow: "本轮回答嘉宾", title: "有请嘉宾回答问题", hint: "请分享你的观察、经验或思考" },
  speaking: { eyebrow: "嘉宾正在回答", title: "我正在认真听", hint: "回答结束后，嘉宾会把一个新问题留给下一位" },
  askingQuestion: { eyebrow: "问题接力 · 嘉宾提问", title: "请留下一个问题", hint: "把你的好奇，交给下一位嘉宾" },
  leavingQuestion: { eyebrow: "TA留下的问题", title: "一个新问题，正在交给下一位", hint: "问题接力，继续发生" },
  complete: { eyebrow: "本轮接力完成", title: "谢谢回答，也谢谢新的问题", hint: "接下来，有请下一位嘉宾" },
  finished: { eyebrow: "问题接力结束", title: "感谢每一次真实的回答", hint: "每一个回答，也都是下一个问题的开始" }
};

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

let channel;
try {
  channel = new BroadcastChannel(CHANNEL_NAME);
} catch {
  channel = null;
}

export function createStore(defaultConfig) {
  let snapshot = load(defaultConfig);
  let remote = false;
  let eventSource = null;
  let connection = { mode: "local", connected: true, canControl: true, message: "本机预览模式" };
  const listeners = new Set();
  const connectionListeners = new Set();
  const apiUrl = (endpoint) => new URL(`api/${endpoint}`, location.href).toString();
  const controlToken = readControlToken();

  function emit(save = true, shareLocally = true) {
    snapshot.runtime.revision += 1;
    if (save) localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    if (shareLocally) channel?.postMessage(snapshot);
    listeners.forEach((listener) => listener(snapshot));
  }

  function applyIncoming(incoming, force = false) {
    if (!incoming?.runtime || (!force && incoming.runtime.revision <= snapshot.runtime.revision)) return;
    snapshot = incoming;
    listeners.forEach((listener) => listener(snapshot));
  }

  function setConnection(next) {
    connection = next;
    connectionListeners.forEach((listener) => listener(connection));
  }

  async function dispatch(command, mutate) {
    const previous = structuredClone(snapshot);
    const result = mutate();
    emit(!remote, !remote);
    if (!remote) return result;
    try {
      const response = await fetch(apiUrl("action"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(controlToken ? { "X-Control-Token": controlToken } : {})
        },
        body: JSON.stringify(command)
      });
      if (!response.ok) throw new Error(response.status === 401 ? "操作口令不正确" : `服务器返回 ${response.status}`);
      applyIncoming(await response.json(), true);
      setConnection({ ...connection, mode: "server", connected: true, message: connection.canControl ? "服务器实时同步已连接" : "实时观看已连接 · 当前无操作权限" });
      return result;
    } catch (error) {
      snapshot = previous;
      listeners.forEach((listener) => listener(snapshot));
      setConnection({ ...connection, mode: "server", connected: false, message: error.message || "服务器操作失败" });
      return false;
    }
  }

  channel?.addEventListener("message", (event) => {
    if (!event.data?.runtime || event.data.runtime.revision <= snapshot.runtime.revision) return;
    applyIncoming(event.data);
  });

  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    const incoming = JSON.parse(event.newValue);
    if (incoming.runtime.revision > snapshot.runtime.revision) {
      applyIncoming(incoming);
    }
  });

  return {
    get: () => snapshot,
    getConnection: () => connection,
    subscribe(listener) {
      listeners.add(listener);
      listener(snapshot);
      return () => listeners.delete(listener);
    },
    subscribeConnection(listener) {
      connectionListeners.add(listener);
      listener(connection);
      return () => connectionListeners.delete(listener);
    },
    async connectRemote() {
      if (!/^https?:$/.test(location.protocol)) return false;
      setConnection({ mode: "connecting", connected: false, canControl: Boolean(controlToken), message: "正在连接服务器……" });
      try {
        const response = await fetch(apiUrl("state"), { cache: "no-store" });
        if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw new Error("Realtime API unavailable");
        remote = true;
        const requiresToken = response.headers.get("x-control-required") === "1";
        const canControl = !requiresToken || Boolean(controlToken);
        setConnection({ mode: "server", connected: true, canControl, message: canControl ? "服务器实时同步已连接" : "实时观看已连接 · 当前无操作权限" });
        applyIncoming(await response.json(), true);
        eventSource?.close();
        eventSource = new EventSource(apiUrl("events"));
        eventSource.onopen = () => setConnection({ mode: "server", connected: true, canControl, message: canControl ? "服务器实时同步已连接" : "实时观看已连接 · 当前无操作权限" });
        eventSource.onmessage = (event) => {
          try {
            applyIncoming(JSON.parse(event.data));
          } catch {
            setConnection({ mode: "server", connected: false, canControl, message: "收到的服务器状态无效" });
          }
        };
        eventSource.onerror = () => setConnection({ mode: "server", connected: false, canControl, message: "实时连接正在自动重连……" });
        return true;
      } catch {
        remote = false;
        setConnection({ mode: "local", connected: true, canControl: true, message: "本机预览模式" });
        return false;
      }
    },
    setPhase(phase) {
      return dispatch({ action: "setPhase", phase }, () => {
        snapshot.runtime.phase = phase;
        return true;
      });
    },
    reveal(kind) {
      return dispatch({ action: "reveal", kind }, () => {
        const key = `revealed${kind[0].toUpperCase()}${kind.slice(1)}`;
        snapshot.runtime[key] = true;
        return true;
      });
    },
    nextRound(nextPhase = "idle") {
      return dispatch({ action: "nextRound", nextPhase }, () => {
        const current = snapshot.runtime.round;
        if (!snapshot.runtime.completedRounds.includes(current)) snapshot.runtime.completedRounds.push(current);
        const next = nextEnabledRound(snapshot.config, current);
        if (!next) snapshot.runtime.phase = "finished";
        else Object.assign(snapshot.runtime, { round: next, phase: nextPhase, revealedQuestion: nextPhase === "drawingSpeaker", revealedSpeaker: false, revealedOutgoing: false });
        return Boolean(next);
      });
    },
    finish() {
      return dispatch({ action: "finish" }, () => {
        snapshot.runtime.phase = "finished";
        return true;
      });
    },
    reset() {
      return dispatch({ action: "reset" }, () => {
        const revision = snapshot.runtime.revision;
        snapshot.runtime = { ...initialRuntime(snapshot.config), revision };
        return true;
      });
    },
    updateConfig(config) {
      return dispatch({ action: "updateConfig", config }, () => {
        snapshot.config = config;
        if (!config.groups[snapshot.runtime.round - 1]?.enabled) {
          snapshot.runtime.round = firstEnabledRound(config);
          snapshot.runtime.phase = "idle";
        }
        return true;
      });
    }
  };
}

function readControlToken() {
  try {
    const token = new URLSearchParams(location.search).get("token");
    if (token) sessionStorage.setItem("kanshan-control-token", token);
    return token || sessionStorage.getItem("kanshan-control-token") || "";
  } catch {
    return "";
  }
}

function load(defaultConfig) {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.config?.groups?.length === 15 && saved.config.groups.every((group) => "outgoingQuestion" in group) && saved?.runtime) return saved;
  } catch {
    // A clean default is safer than blocking the show on corrupted local state.
  }
  return { config: structuredClone(defaultConfig), runtime: initialRuntime(defaultConfig) };
}

function firstEnabledRound(config) {
  const index = config.groups.findIndex((group) => group.enabled);
  return index < 0 ? 1 : index + 1;
}

function nextEnabledRound(config, current) {
  const index = config.groups.findIndex((group, groupIndex) => groupIndex + 1 > current && group.enabled);
  return index < 0 ? null : index + 1;
}

export function activeGroups(config) {
  return config.groups.filter((group) => group.enabled);
}

export function currentGroup(snapshot) {
  return snapshot.config.groups[snapshot.runtime.round - 1] || snapshot.config.groups[0];
}

export function currentActivePosition(snapshot) {
  const enabled = snapshot.config.groups.map((group, index) => ({ group, round: index + 1 })).filter(({ group }) => group.enabled);
  return {
    position: Math.max(1, enabled.findIndex(({ round }) => round === snapshot.runtime.round) + 1),
    total: enabled.length
  };
}
