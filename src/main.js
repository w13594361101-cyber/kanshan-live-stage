import "./styles.css";
import { mountKanshan } from "./model.js";
import { createStore, findSelected, phases } from "./store.js";

const BASE = import.meta.env.BASE_URL;
const params = new URLSearchParams(location.search);
const view = params.get("view") || "home";
const demo = params.get("demo") === "1";
const app = document.querySelector("#app");
let store;

boot();

async function boot() {
  try {
    const defaults = await fetch(`${BASE}config/activity.json`).then((response) => {
      if (!response.ok) throw new Error("activity config failed to load");
      return response.json();
    });
    store = createStore(defaults);
    if (view === "control") renderControl();
    else if (view === "stage") renderStage();
    else renderHome();
  } catch {
    app.innerHTML = `<main class="load-error"><strong>页面资源没有完整加载</strong><span>请刷新页面，或检查部署包中的 config/activity.json 是否存在。</span></main>`;
  }
}

function brand(config, compact = false) {
  return `<div class="brand ${compact ? "brand--compact" : ""}">
    <span class="brand-mark">?</span>
    <span><strong>${escapeHtml(config.productName)}</strong><small>${escapeHtml(config.eventName)} · 现场互动台</small></span>
  </div>`;
}

function renderHome() {
  const { config } = store.get();
  app.innerHTML = `<main class="home-shell">
    <div class="home-noise"></div>
    <header class="home-header">${brand(config)}<span class="version-pill">PUBLIC DEMO · V1</span></header>
    <section class="home-hero">
      <div class="home-copy">
        <p class="kicker"><span></span> 一个问题，找到两种回应</p>
        <h1>让看山，<br><em>把问题带到现场。</em></h1>
        <p class="home-lead">看山随机抽出一道问题，邀请一位嘉宾分享，再找到一位专家回应。五轮互动，让观点在现场真正发生。</p>
        <div class="home-actions">
          <a class="button button--primary" href="?view=stage&demo=1">开始体验 <span>→</span></a>
          <a class="button button--ghost" href="?view=control">打开控制台</a>
        </div>
        <div class="home-steps"><span>01 看山抽题</span><i></i><span>02 嘉宾分享</span><i></i><span>03 专家点评</span></div>
      </div>
      <div class="home-model"><div id="model-home" class="model-canvas"></div><div class="question-orbit"><span>?</span><span>?</span><span>?</span></div></div>
    </section>
    <footer class="home-footer"><span>为 16:9 现场大屏设计</span><span>离线可运行 · GitHub / 知乎静态部署兼容</span></footer>
  </main>`;
  mountKanshan(document.querySelector("#model-home"));
}

function renderStage() {
  app.innerHTML = `<main class="stage-shell">
    <div class="stage-grid"></div>
    <header class="stage-header"><div id="stage-brand"></div><div class="rounds" id="rounds"></div></header>
    <section class="stage-content">
      <div class="stage-character"><div class="model-halo"></div><div id="model-stage" class="model-canvas"></div><div class="kanshan-caption"><span class="live-dot"></span> 看山在线</div></div>
      <div class="stage-story" id="stage-story"></div>
    </section>
    <footer class="stage-footer"><span>PUJIANG INNOVATION FORUM</span><span>一个问题，找到两种回应</span></footer>
    ${demo ? `<div class="demo-dock"><button id="demo-back" aria-label="返回首页">⌂</button><div><small>公开演示控制</small><strong id="demo-status">准备开始</strong></div><button class="demo-next" id="demo-next">开始抽题 <span>→</span></button></div>` : ""}
  </main>`;
  const model = mountKanshan(document.querySelector("#model-stage"));
  const brandSlot = document.querySelector("#stage-brand");
  const story = document.querySelector("#stage-story");
  const rounds = document.querySelector("#rounds");
  store.subscribe((snapshot) => {
    brandSlot.innerHTML = brand(snapshot.config, true);
    renderRounds(rounds, snapshot.runtime.round, snapshot.runtime.phase);
    story.innerHTML = stageStory(snapshot);
    document.body.dataset.phase = snapshot.runtime.phase;
    model.setPhase(snapshot.runtime.phase);
    if (demo) updateDemoDock(snapshot);
  });
  if (demo) {
    document.querySelector("#demo-next").addEventListener("click", advance);
    document.querySelector("#demo-back").addEventListener("click", () => (location.href = BASE));
  }
  window.addEventListener("keydown", (event) => {
    if (event.code === "Space" && demo) {
      event.preventDefault();
      advance();
    }
  });
}

function stageStory(snapshot) {
  const { runtime, config } = snapshot;
  const meta = { ...phases[runtime.phase] };
  meta.eyebrow = runtime.phase === "finished" ? meta.eyebrow : `ROUND ${String(runtime.round).padStart(2, "0")} · ${meta.eyebrow}`;
  const question = findSelected(snapshot, "question");
  const speaker = findSelected(snapshot, "speaker");
  const expert = findSelected(snapshot, "expert");
  const drawing = runtime.phase.startsWith("drawing");
  let main = `<div class="idle-card"><span class="giant-mark">?</span><p>${escapeHtml(meta.title)}</p></div>`;

  if (runtime.phase === "drawingQuestion") main = rouletteMarkup(config.questions.map((item) => item.text), "question");
  if (["question", "drawingSpeaker", "speaker", "speaking", "drawingExpert", "expert", "commenting", "complete"].includes(runtime.phase) && question) {
    main = `<article class="question-card ${drawing ? "is-drawing" : ""}"><div class="question-label"><span>${escapeHtml(question.tag)}</span> TODAY'S QUESTION</div><h2>${escapeHtml(question.text)}</h2></article>`;
  }

  let people = "";
  if (runtime.phase === "drawingSpeaker") people = rouletteMarkup(config.speakers.filter((item) => item.available).map((item) => item.name), "person");
  if (["speaker", "speaking", "drawingExpert", "expert", "commenting", "complete"].includes(runtime.phase) && speaker) {
    people = personCard(speaker, "分享嘉宾", runtime.phase === "speaking" ? "正在分享" : "已抽取", "speaker");
  }
  if (runtime.phase === "drawingExpert") people += rouletteMarkup(config.experts.filter((item) => item.available).map((item) => item.name), "person");
  if (["expert", "commenting", "complete"].includes(runtime.phase) && expert) {
    people += personCard(expert, "点评专家", runtime.phase === "commenting" ? "正在点评" : "已抽取", "expert");
  }

  return `<div class="stage-meta"><p>${escapeHtml(meta.eyebrow)}</p><h1>${escapeHtml(meta.title)}</h1><span>${escapeHtml(meta.hint)}</span></div><div class="story-main">${main}</div>${people ? `<div class="people-row">${people}</div>` : ""}`;
}

function rouletteMarkup(items, type) {
  const repeated = [...items, ...items].slice(0, 9);
  return `<div class="roulette roulette--${type}"><div class="roulette-track">${repeated.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div><div class="roulette-focus"></div></div>`;
}

function personCard(person, role, status, variant) {
  return `<article class="person-card person-card--${variant}"><div class="person-index">${variant === "speaker" ? "S" : "E"}</div><div><small>${role} · ${status}</small><h3>${escapeHtml(person.name)}</h3><p>${escapeHtml(person.title)}</p></div><span class="person-signal"></span></article>`;
}

function renderControl() {
  const snapshot = store.get();
  app.innerHTML = `<main class="control-shell">
    <header class="control-header">${brand(snapshot.config)}<div class="control-actions"><a href="?view=stage" target="_blank">打开大屏 ↗</a><a href="?view=stage&demo=1" target="_blank">打开演示 ↗</a></div></header>
    <section class="control-layout">
      <div class="control-main"><div class="control-kicker">现场导演台 <span>LOCAL CONTROL</span></div><div id="control-status"></div><div id="control-buttons" class="control-buttons"></div><div class="control-note"><span>提示</span>大屏和控制台请在同一浏览器中打开。现场建议关闭通知，并提前测试全屏输出。</div></div>
      <aside class="config-panel"><div class="config-title"><div><small>活动内容</small><h2>五轮配置</h2></div><button id="save-config" class="mini-button">保存修改</button></div><div id="config-editor"></div></aside>
    </section>
  </main>`;
  const status = document.querySelector("#control-status");
  const buttons = document.querySelector("#control-buttons");
  const editor = document.querySelector("#config-editor");
  store.subscribe((next) => {
    status.innerHTML = controlStatus(next);
    buttons.innerHTML = controlButtons(next);
    bindControlButtons(buttons, next);
  });
  editor.innerHTML = configEditor(snapshot.config);
  document.querySelector("#save-config").addEventListener("click", () => {
    const config = readEditor(store.get().config);
    store.updateConfig(config);
    const button = document.querySelector("#save-config");
    button.textContent = "已保存";
    setTimeout(() => (button.textContent = "保存修改"), 1200);
  });
}

function controlStatus(snapshot) {
  const { runtime } = snapshot;
  const question = findSelected(snapshot, "question");
  const speaker = findSelected(snapshot, "speaker");
  const expert = findSelected(snapshot, "expert");
  return `<div class="control-round"><span>当前进度</span><strong>${runtime.phase === "finished" ? "活动完成" : `第 ${runtime.round} / 5 轮`}</strong></div>
    <div class="control-phase"><small>${phases[runtime.phase].eyebrow}</small><h1>${phases[runtime.phase].title}</h1><p>${phases[runtime.phase].hint}</p></div>
    <div class="control-results">
      <div><span>问题</span><strong>${escapeHtml(question?.text || "尚未抽取")}</strong></div>
      <div><span>分享嘉宾</span><strong>${escapeHtml(speaker?.name || "尚未抽取")}</strong></div>
      <div><span>点评专家</span><strong>${escapeHtml(expert?.name || "尚未抽取")}</strong></div>
    </div>`;
}

function controlButtons(snapshot) {
  const phase = snapshot.runtime.phase;
  return `<button class="control-primary" data-action="advance" ${phase.includes("drawing") || phase === "finished" ? "disabled" : ""}>${nextLabel(phase)} <span>→</span></button>
    <div class="control-secondary">
      ${["question", "speaker", "expert"].includes(phase) ? `<button data-action="redraw">重新抽取当前结果</button>` : ""}
      <button data-action="reset">重置整场活动</button>
    </div>`;
}

function bindControlButtons(container, snapshot) {
  container.querySelector('[data-action="advance"]')?.addEventListener("click", advance);
  container.querySelector('[data-action="redraw"]')?.addEventListener("click", () => {
    const kind = snapshot.runtime.phase;
    if (confirm("确定重新抽取当前结果吗？")) store.redraw(kind);
  });
  container.querySelector('[data-action="reset"]')?.addEventListener("click", () => {
    if (confirm("确定清空五轮记录并回到第一轮吗？")) store.reset();
  });
}

function configEditor(config) {
  const section = (title, type, items, field, availability) => `<section class="editor-section"><h3>${title}<span>${items.length}</span></h3>${items.map((item, index) => `<div class="editor-row"><span>${String(index + 1).padStart(2, "0")}</span><div class="editor-fields"><input data-type="${type}" data-index="${index}" data-field="${field}" value="${escapeAttr(item[field])}" aria-label="${title}${index + 1}">${item.title !== undefined ? `<input class="sub-input" data-type="${type}" data-index="${index}" data-field="title" value="${escapeAttr(item.title)}" aria-label="身份信息">` : ""}</div><label class="toggle"><input type="checkbox" data-type="${type}" data-index="${index}" data-field="${availability}" ${item[availability] ? "checked" : ""}><i></i></label></div>`).join("")}</section>`;
  return `${section("问题", "questions", config.questions, "text", "enabled")}${section("分享嘉宾", "speakers", config.speakers, "name", "available")}${section("点评专家", "experts", config.experts, "name", "available")}`;
}

function readEditor(oldConfig) {
  const next = structuredClone(oldConfig);
  document.querySelectorAll("[data-type][data-index][data-field]").forEach((input) => {
    const item = next[input.dataset.type][Number(input.dataset.index)];
    item[input.dataset.field] = input.type === "checkbox" ? input.checked : input.value.trim();
  });
  return next;
}

function advance() {
  const { phase } = store.get().runtime;
  if (phase === "idle") return runDraw("question", "drawingQuestion", "question");
  if (phase === "question") return runDraw("speaker", "drawingSpeaker", "speaker");
  if (phase === "speaker") return store.setPhase("speaking");
  if (phase === "speaking") return runDraw("expert", "drawingExpert", "expert");
  if (phase === "expert") return store.setPhase("commenting");
  if (phase === "commenting") return store.setPhase("complete");
  if (phase === "complete") return store.nextRound();
}

function runDraw(kind, drawingPhase, revealPhase) {
  store.setPhase(drawingPhase);
  setTimeout(() => {
    const result = store.draw(kind);
    store.setPhase(result ? revealPhase : "complete");
  }, 2200);
}

function nextLabel(phase) {
  return ({ idle: "抽一道现场问题", question: "抽取分享嘉宾", speaker: "开始嘉宾分享", speaking: "分享结束，抽点评专家", expert: "开始专家点评", commenting: "完成本轮", complete: "进入下一轮", finished: "五轮已完成" })[phase] || "请稍候";
}

function updateDemoDock(snapshot) {
  document.querySelector("#demo-status").textContent = `第 ${Math.min(snapshot.runtime.round, 5)} 轮 · ${phases[snapshot.runtime.phase].eyebrow}`;
  const button = document.querySelector("#demo-next");
  button.innerHTML = `${nextLabel(snapshot.runtime.phase)} <span>→</span>`;
  button.disabled = snapshot.runtime.phase.startsWith("drawing") || snapshot.runtime.phase === "finished";
}

function renderRounds(container, current, phase) {
  container.innerHTML = Array.from({ length: 5 }, (_, index) => `<span class="${index + 1 < current || phase === "finished" ? "is-done" : index + 1 === current ? "is-current" : ""}">${String(index + 1).padStart(2, "0")}</span>`).join("");
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function escapeAttr(value = "") {
  return escapeHtml(value).replace(/`/g, "&#96;");
}
