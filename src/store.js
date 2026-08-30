const STORAGE_KEY = "kanshan-live-stage-v1";
const CHANNEL_NAME = "kanshan-live-stage";

export const phases = {
  idle: { eyebrow: "等待开始", title: "看山正在寻找今天的问题", hint: "准备好后，开始抽题" },
  drawingQuestion: { eyebrow: "问题正在出现", title: "让看山想一想……", hint: "五道问题正在快速穿过现场" },
  question: { eyebrow: "看山有问", title: "问题已经送达", hint: "接下来，寻找一位分享者" },
  drawingSpeaker: { eyebrow: "寻找分享者", title: "谁来回应这个问题？", hint: "看山正在现场寻找" },
  speaker: { eyebrow: "本轮分享嘉宾", title: "有请分享", hint: "把你的观察和经验留在现场" },
  speaking: { eyebrow: "正在分享", title: "看山正在认真听", hint: "分享结束后，将邀请专家回应" },
  drawingExpert: { eyebrow: "寻找专业回应", title: "这一次，谁来接住回答？", hint: "专家席正在回应" },
  expert: { eyebrow: "本轮点评专家", title: "有请点评", hint: "为刚才的分享补充一个专业视角" },
  commenting: { eyebrow: "正在点评", title: "一个回答，正在遇见另一个视角", hint: "看山正在认真听" },
  complete: { eyebrow: "本轮完成", title: "谢谢每一次真实的分享", hint: "问题有了回应，也留下了新的问题" },
  finished: { eyebrow: "五轮完成", title: "谢谢来到问题的现场", hint: "每一个回答，都是下一次探索的开始" }
};

const initialRuntime = {
  round: 1,
  phase: "idle",
  questionId: null,
  speakerId: null,
  expertId: null,
  usedQuestionIds: [],
  usedSpeakerIds: [],
  usedExpertIds: [],
  revision: 0
};

let channel;
try {
  channel = new BroadcastChannel(CHANNEL_NAME);
} catch {
  channel = null;
}

export function createStore(defaultConfig) {
  let snapshot = load(defaultConfig);
  const listeners = new Set();

  function emit(save = true) {
    snapshot.runtime.revision += 1;
    if (save) localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    channel?.postMessage(snapshot);
    listeners.forEach((listener) => listener(snapshot));
  }

  channel?.addEventListener("message", (event) => {
    if (!event.data?.runtime || event.data.runtime.revision <= snapshot.runtime.revision) return;
    snapshot = event.data;
    listeners.forEach((listener) => listener(snapshot));
  });

  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    const incoming = JSON.parse(event.newValue);
    if (incoming.runtime.revision > snapshot.runtime.revision) {
      snapshot = incoming;
      listeners.forEach((listener) => listener(snapshot));
    }
  });

  return {
    get: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      listener(snapshot);
      return () => listeners.delete(listener);
    },
    setPhase(phase) {
      snapshot.runtime.phase = phase;
      emit();
    },
    draw(kind) {
      const map = {
        question: ["questions", "enabled", "usedQuestionIds", "questionId"],
        speaker: ["speakers", "available", "usedSpeakerIds", "speakerId"],
        expert: ["experts", "available", "usedExpertIds", "expertId"]
      };
      const [listKey, availabilityKey, usedKey, selectedKey] = map[kind];
      const eligible = snapshot.config[listKey].filter(
        (item) => item[availabilityKey] && !snapshot.runtime[usedKey].includes(item.id)
      );
      if (!eligible.length) return null;
      const chosen = eligible[Math.floor(Math.random() * eligible.length)];
      snapshot.runtime[selectedKey] = chosen.id;
      snapshot.runtime[usedKey].push(chosen.id);
      emit();
      return chosen;
    },
    redraw(kind) {
      const keys = {
        question: ["usedQuestionIds", "questionId"],
        speaker: ["usedSpeakerIds", "speakerId"],
        expert: ["usedExpertIds", "expertId"]
      };
      const [usedKey, selectedKey] = keys[kind];
      const current = snapshot.runtime[selectedKey];
      snapshot.runtime[usedKey] = snapshot.runtime[usedKey].filter((id) => id !== current);
      snapshot.runtime[selectedKey] = null;
      emit();
      return this.draw(kind);
    },
    nextRound() {
      if (snapshot.runtime.round >= 5) {
        snapshot.runtime.phase = "finished";
      } else {
        snapshot.runtime.round += 1;
        Object.assign(snapshot.runtime, {
          phase: "idle",
          questionId: null,
          speakerId: null,
          expertId: null
        });
      }
      emit();
    },
    reset() {
      snapshot.runtime = { ...initialRuntime, revision: snapshot.runtime.revision };
      emit();
    },
    updateConfig(config) {
      snapshot.config = config;
      emit();
    }
  };
}

function load(defaultConfig) {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.config && saved?.runtime) return saved;
  } catch {
    // A clean default is safer than blocking the show on corrupted local state.
  }
  return { config: structuredClone(defaultConfig), runtime: { ...initialRuntime } };
}

export function findSelected(snapshot, kind) {
  const plural = kind === "question" ? "questions" : kind === "speaker" ? "speakers" : "experts";
  return snapshot.config[plural].find((item) => item.id === snapshot.runtime[`${kind}Id`]);
}
