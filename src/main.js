import "./styles.css";
import { mountKanshan } from "./model.js";
import { defaults } from "./defaults.js";
import { activeGroups, createStore, currentActivePosition, currentGroup, phases } from "./store.js";

const BASE = import.meta.env.BASE_URL;
const params = new URLSearchParams(location.search);
const view = params.get("view") || "home";
const controlToken = readPageControlToken();
const app = document.querySelector("#app");
let store;

boot();

function boot() {
  store = createStore(defaults);
  if (["operate", "control"].includes(view)) renderOperate();
  else if (view === "admin") renderAdmin();
  else if (view === "stage") renderStage();
  else renderHome();
  void store.connectRemote();
}

function viewHref(nextView, includeControl = false) {
  const query = new URLSearchParams({ view: nextView });
  if (includeControl && controlToken) query.set("token", controlToken);
  return `?${query}`;
}

function readPageControlToken() {
  try {
    return params.get("token") || sessionStorage.getItem("kanshan-control-token") || "";
  } catch {
    return params.get("token") || "";
  }
}

function brand(config, compact = false) {
  return `<div class="brand ${compact ? "brand--compact" : ""}">
    <div class="brand-lockup" aria-label="浦江创新论坛与知乎联合呈现">
      <img class="brand-logo brand-logo--forum" src="${BASE}assets/brand/pujiang-forum-logo-white.png" alt="浦江创新论坛">
      <span class="brand-divider" aria-hidden="true"></span>
      <img class="brand-logo brand-logo--zhihu" src="${BASE}assets/brand/zhihu-logo-white.png" alt="知乎">
    </div>
    <small>${escapeHtml(config.eventName)}</small>
  </div>`;
}

function renderHome() {
  const { config } = store.get();
  app.innerHTML = `<main class="home-shell">
    <div class="home-noise"></div>
    <header class="home-header">${brand(config)}<span class="version-pill">LIVE FLOW · V2</span></header>
    <section class="home-hero">
      <div class="home-copy">
        <p class="kicker"><span></span> 一个问题，接力到下一位</p>
        <h1>让问题，<br><em>在现场继续发生。</em></h1>
        <p class="home-lead">一位嘉宾回答上一位留下的问题，再把一个新问题交给下一位。十二位嘉宾，让思考在现场接力。</p>
        <div class="home-actions">
          <a class="button button--primary" href="${viewHref("stage")}">打开现场大屏 <span>→</span></a>
          <a class="button button--ghost" href="${viewHref("operate", true)}">打开按钮页</a>
          <a class="button button--ghost" href="${viewHref("admin", true)}">配置后台</a>
        </div>
        <div class="home-steps"><span>01 接住问题</span><i></i><span>02 嘉宾回答</span><i></i><span>03 留给下一位</span></div>
      </div>
      <div class="home-model"><div id="model-home" class="model-canvas"></div><div class="question-orbit"><span>?</span><span>?</span><span>?</span></div></div>
    </section>
    <footer class="home-footer"><span>为 16:9 现场大屏设计</span><span>12 位嘉宾问题接力 · 3 组备用</span></footer>
  </main>`;
  mountKanshan(document.querySelector("#model-home"));
}

function renderStage() {
  app.innerHTML = `<main class="stage-shell">
    <div class="stage-canvas">
      <div class="stage-grid"></div>
      <div class="stage-visual" aria-hidden="true"><i></i><i></i><i></i><span>Y-HUBS</span></div>
      <header class="stage-header"><div id="stage-brand"></div><div class="rounds" id="rounds"></div></header>
      <section class="stage-content">
        <div class="stage-character"><div class="model-halo"></div><div id="model-stage" class="model-canvas"></div><div id="kanshan-bubble" class="kanshan-bubble" role="status" aria-live="polite"></div><div class="kanshan-caption"><span class="live-dot"></span> 刘看山</div></div>
        <div class="stage-story" id="stage-story"></div>
      </section>
      <aside class="stage-controls" id="stage-controls" aria-label="现场操作按钮"></aside>
      <footer class="stage-footer"><span>PUJIANG INNOVATION FORUM · ZHIHU</span><span>一个问题，接力到下一位</span></footer>
    </div>
  </main>`;
  const model = mountKanshan(document.querySelector("#model-stage"));
  const brandSlot = document.querySelector("#stage-brand");
  const story = document.querySelector("#stage-story");
  const rounds = document.querySelector("#rounds");
  const controls = document.querySelector("#stage-controls");
  const bubble = document.querySelector("#kanshan-bubble");
  let bubbleKey = "";
  store.subscribe((snapshot) => {
    brandSlot.innerHTML = brand(snapshot.config, true);
    renderRounds(rounds, snapshot);
    story.innerHTML = stageStory(snapshot);
    controls.innerHTML = stageControlButtons(snapshot);
    bindStageButtons(controls);
    const nextBubble = kanshanBubble(snapshot);
    if (nextBubble.key !== bubbleKey) {
      bubbleKey = nextBubble.key;
      bubble.innerHTML = `<span>${escapeHtml(nextBubble.text)}</span>`;
      bubble.classList.remove("is-entering");
      void bubble.offsetWidth;
      bubble.classList.add("is-visible", "is-entering");
    }
    document.body.dataset.phase = snapshot.runtime.phase;
    model.setPhase(snapshot.runtime.phase);
  });
  store.subscribeConnection(() => {
    controls.innerHTML = stageControlButtons(store.get());
    bindStageButtons(controls);
  });
  window.addEventListener("keydown", (event) => {
    if (event.code === "Space" && !event.repeat) {
      event.preventDefault();
      const phase = store.get().runtime.phase;
      if (!phase.startsWith("drawing") && phase !== "finished") advance();
    }
    if (event.key.toLowerCase() === "f") toggleFullscreen();
  });
}

function kanshanBubble(snapshot) {
  const { phase, round } = snapshot.runtime;
  const group = currentGroup(snapshot);
  const progress = currentActivePosition(snapshot);
  const variant = Math.max(0, progress.position - 1);
  const copy = {
    idle: ["准备好了吗？问题接力马上开始"],
    drawingQuestion: ["问题正在打开……"],
    question: [
      "这个问题，会交给谁来回答呢？",
      "好问题，接下来交给哪位嘉宾？",
      "让我们看看，谁来接住这个问题"
    ],
    drawingSpeaker: [
      "下一位回答嘉宾即将揭晓",
      "接住问题的嘉宾，会是谁呢？",
      "下一位，会是谁呢？"
    ],
    speaking: [
      "让我们一起听听 TA 的分享",
      "把时间交给本轮嘉宾",
      "一起来听听 TA 的思考"
    ],
    askingQuestion: [
      "谢谢分享，也请留下一道问题",
      "感谢分享，请把一个问题交给下一位",
      "接下来，请为下一位留下一份好奇"
    ],
    leavingQuestion: [
      "这个问题，将交给下一位嘉宾",
      "新的问题，等待下一位来回答",
      "让我们看看，谁会接住这个问题"
    ],
    complete: ["谢谢分享，问题接力即将收尾"],
    finished: ["谢谢大家，让好问题继续发生！"]
  };
  const speakerCopy = [
    `有请 ${group.speaker.name} 接住这个问题`,
    `欢迎 ${group.speaker.name} 回答这个问题`,
    `把这个问题交给 ${group.speaker.name}`
  ];
  const choices = phase === "speaker" ? speakerCopy : copy[phase] || ["让问题继续发生"];
  return { key: `${round}-${phase}`, text: choices[variant % choices.length] };
}

function stageControlButtons(snapshot) {
  const connection = store.getConnection();
  if (connection.mode === "server" && !connection.canControl) {
    return `<button class="stage-control-toggle" data-action="toggle-controls" aria-expanded="false"><b>···</b><span>查看</span></button><div class="stage-control-panel"><small>实时观看模式</small><button class="stage-fullscreen" data-action="fullscreen">全屏</button></div>`;
  }
  const phase = snapshot.runtime.phase;
  const waiting = phase.startsWith("drawing");
  if (phase === "finished") return `<button class="stage-control-toggle" data-action="toggle-controls" aria-expanded="false"><b>···</b><span>操作</span></button><div class="stage-control-panel"><span class="stage-controls-finished">活动已结束</span><button class="stage-fullscreen" data-action="fullscreen">全屏</button></div>`;
  return `<button class="stage-control-toggle" data-action="toggle-controls" aria-expanded="false"><b>···</b><span>操作</span></button><div class="stage-control-panel"><small>空格键继续</small><button class="stage-action" data-action="advance" ${waiting ? "disabled" : ""}>${nextLabel(snapshot)} <span>→</span></button><button class="stage-fullscreen" data-action="fullscreen">全屏</button><button class="stage-finish" data-action="finish">结束</button></div>`;
}

function bindStageButtons(container) {
  let hideTimer;
  const scheduleHide = () => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      container.classList.remove("is-open");
      container.classList.add("is-dormant");
      container.querySelector('[data-action="toggle-controls"]')?.setAttribute("aria-expanded", "false");
    }, 3000);
  };
  container.classList.remove("is-open", "is-dormant");
  container.querySelector('[data-action="toggle-controls"]')?.addEventListener("click", () => {
    const open = container.classList.toggle("is-open");
    container.classList.remove("is-dormant");
    container.querySelector('[data-action="toggle-controls"]')?.setAttribute("aria-expanded", String(open));
    scheduleHide();
  });
  container.querySelector('[data-action="advance"]')?.addEventListener("click", advance);
  container.querySelector('[data-action="fullscreen"]')?.addEventListener("click", toggleFullscreen);
  container.querySelector('[data-action="finish"]')?.addEventListener("click", () => {
    if (confirm("确定直接结束活动吗？现场大屏将立即进入结束页面。")) store.finish();
  });
  container.addEventListener("pointerenter", () => {
    clearTimeout(hideTimer);
    container.classList.remove("is-dormant");
  });
  container.addEventListener("pointerleave", scheduleHide);
  scheduleHide();
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.();
}

function stageStory(snapshot) {
  const { runtime, config } = snapshot;
  const meta = { ...phases[runtime.phase] };
  if (runtime.phase === "finished") {
    const speakers = activeGroups(config).map((item) => item.speaker);
    const relayCount = Math.max(0, speakers.length - 1);
    return `<div class="ending-card"><p>${escapeHtml(meta.eyebrow)}</p><span class="ending-mark">✓</span><h1>${escapeHtml(meta.title)}</h1><h2>${escapeHtml(meta.hint)}</h2><div class="ending-summary"><strong>${speakers.length}</strong><span>位嘉宾</span><i></i><strong>${relayCount}</strong><span>次问题传递</span></div>${endingSpeakerStrip(speakers)}<div class="ending-line"></div><small>THANK YOU FOR BEING PART OF THE CONVERSATION</small></div>`;
  }

  const group = currentGroup(snapshot);
  if (runtime.phase === "complete" && !group.nextSpeaker) {
    meta.title = "最后一位嘉宾回答完成";
    meta.hint = "问题接力交还主持人，准备进入活动收尾";
  }
  const progress = currentActivePosition(snapshot);
  meta.eyebrow = `问题接力 ${String(progress.position).padStart(2, "0")} / ${String(progress.total).padStart(2, "0")} · ${meta.eyebrow}`;
  const drawing = runtime.phase.startsWith("drawing");
  const idlePrompt = runtime.phase === "idle" ? "准备好了吗，互动马上开始" : meta.title;
  let main = `<div class="idle-card"><span class="giant-mark">?</span><p>${escapeHtml(idlePrompt)}</p></div>`;

  if (runtime.phase === "drawingQuestion") main = rouletteMarkup(activeGroups(config).map((item) => item.question.text), "question");
  if (runtime.phase === "question") {
    main = questionWithAsker(snapshot, group.question, group.question.text, false, "", group.question.textEn);
  }
  if (["drawingSpeaker", "speaker", "speaking"].includes(runtime.phase)) {
    main = questionWithAsker(snapshot, group.question, group.question.text, drawing, "question-card--prompt", group.question.textEn);
  }
  if (runtime.phase === "askingQuestion") {
    main = `<article class="leave-question-prompt"><span class="leave-question-mark">?</span><small>QUESTION RELAY</small><h2>请留下一个问题</h2><p>把你的好奇，交给下一位嘉宾</p></article>`;
  }
  if (runtime.phase === "leavingQuestion") {
    main = questionWithAsker(snapshot, { asker: group.speaker.name, askerEn: group.speaker.nameEn }, group.outgoingQuestion, false, "question-card--outgoing", group.outgoingQuestionEn, group.speaker);
  }
  if (runtime.phase === "complete") {
    main = `<article class="handoff-card handoff-card--final"><small>FINAL ANSWER</small><span>最后一位嘉宾回答完成</span><h2>问题接力，即将收尾</h2><p>接下来交还主持人</p></article>`;
  }

  let people = "";
  if (runtime.phase === "drawingSpeaker") people = speakerRouletteMarkup(activeGroups(config).map((item) => item.speaker), group.speaker.name);
  if (["speaker", "speaking", "askingQuestion"].includes(runtime.phase)) {
    const status = runtime.phase === "speaking" ? "正在回答" : runtime.phase === "askingQuestion" ? "正在提问" : "本轮嘉宾";
    people = personCard(group.speaker, "回答嘉宾", status, "speaker");
  }

  const title = runtime.phase === "idle"
    ? escapeHtml(meta.title).replace("，", "，<br>")
    : escapeHtml(meta.title);
  return `<div class="stage-meta"><p>${escapeHtml(meta.eyebrow)}</p><h1>${title}</h1><span>${escapeHtml(meta.hint)}</span></div><div class="story-main">${main}</div>${people ? `<div class="people-row">${people}</div>` : ""}`;
}

function questionAsker(question) {
  const name = question.askerEn ? `${question.asker} · ${question.askerEn}` : question.asker;
  return `提问人 · ${name}`;
}

function questionWithAsker(snapshot, question, text, drawing = false, extraClass = "", translation = "", forcedPerson = null) {
  const asker = forcedPerson || findSpeaker(snapshot, question.asker);
  const progress = currentActivePosition(snapshot);
  const label = `现场问题 · ${String(progress.position).padStart(2, "0")}`;
  return `<div class="question-block ${extraClass === "question-card--prompt" ? "question-block--prompt" : ""}">${askerBadge(question, asker)}<span class="relay-connector" aria-hidden="true"><i></i></span>${questionCard(text, label, drawing, extraClass, translation)}</div>`;
}

function findSpeaker(snapshot, name = "") {
  const normalized = String(name).replace(/\s+/g, "").toLowerCase();
  if (!normalized) return null;
  return snapshot.config.groups.map((item) => item.speaker).find((speaker) => {
    const names = [speaker.name, speaker.nameEn].filter(Boolean).map((value) => String(value).replace(/\s+/g, "").toLowerCase());
    return names.includes(normalized);
  }) || null;
}

function askerBadge(question, person) {
  const displayName = person?.name || question.asker || "提问嘉宾";
  const initial = escapeHtml(displayName.trim().slice(0, 1) || "问");
  const photo = person?.image
    ? `<img src="${escapeAttr(person.image)}" alt="${escapeAttr(displayName)}">`
    : `<span>${initial}</span>`;
  return `<div class="question-asker"><div class="question-asker-photo">${photo}</div><div><small>提问嘉宾</small><strong>${escapeHtml(displayName)}</strong></div></div>`;
}

function questionCard(text, label, drawing = false, extraClass = "", translation = "") {
  const totalLength = String(text).length + String(translation).length * .45;
  const lengthClass = totalLength > 180 ? "question-card--xlong" : totalLength > 90 ? "question-card--long" : "";
  const english = translation ? `<div class="question-translation"><small>ENGLISH TRANSLATION</small><p>${escapeHtml(translation)}</p></div>` : "";
  return `<article class="question-card ${drawing ? "is-drawing" : ""} ${translation ? "is-bilingual" : ""} ${lengthClass} ${extraClass}"><div class="question-label"><span>?</span>${escapeHtml(label)}</div><h2>${escapeHtml(text)}</h2>${english}</article>`;
}

function rouletteMarkup(items, type) {
  const safeItems = items.length ? items : ["内容待配置"];
  const repeated = [...safeItems, ...safeItems].slice(0, 12);
  return `<div class="roulette roulette--${type}"><div class="roulette-track">${repeated.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div><div class="roulette-focus"></div></div>`;
}

function speakerRouletteMarkup(people, targetName) {
  const candidates = people.length ? people : [{ name: "嘉宾待配置", title: "" }];
  const target = candidates.find((person) => person.name === targetName) || candidates[0];
  const sequence = [...candidates, ...candidates.slice(0, Math.min(5, candidates.length)), target];
  const stopPercent = -((sequence.length - 1) / sequence.length * 100).toFixed(4);
  return `<div class="speaker-roulette"><div class="speaker-roulette-track" style="--stop-percent:${stopPercent}%">${sequence.map((person) => {
    const initial = escapeHtml(person.name.trim().slice(0, 1) || "嘉");
    const photo = person.image ? `<img src="${escapeAttr(person.image)}" alt="">` : `<span>${initial}</span>`;
    return `<article class="speaker-roulette-card"><div class="speaker-roulette-photo">${photo}</div><div><small>回答嘉宾</small><h3>${escapeHtml(person.name)}</h3>${person.nameEn ? `<em>${escapeHtml(person.nameEn)}</em>` : ""}<p>${escapeHtml(person.title || "")}</p></div></article>`;
  }).join("")}</div><div class="speaker-roulette-focus"></div></div>`;
}

function endingSpeakerStrip(people) {
  return `<div class="ending-speakers">${people.map((person, index) => {
    const initial = escapeHtml(person.name.trim().slice(0, 1) || "嘉");
    const photo = person.image ? `<img src="${escapeAttr(person.image)}" alt="">` : `<span>${initial}</span>`;
    const delay = (0.25 + index * 0.045).toFixed(3);
    return `<div class="ending-speaker" style="--speaker-delay:${delay}s"><div>${photo}</div><strong>${escapeHtml(person.name)}</strong></div>`;
  }).join("")}</div>`;
}

function personCard(person, role, status, variant) {
  const initial = escapeHtml(person.name.trim().slice(0, 1) || "嘉");
  const photo = person.image
    ? `<img src="${escapeAttr(person.image)}" alt="${escapeAttr(person.name)}">`
    : `<span>${initial}</span>`;
  return `<article class="person-card person-card--${variant}"><div class="person-photo">${photo}</div><div class="person-copy"><small>${role} · ${status}</small><h3>${escapeHtml(person.name)}</h3>${person.nameEn ? `<em>${escapeHtml(person.nameEn)}</em>` : ""}<p class="person-title">${escapeHtml(person.title)}</p>${person.bio ? `<p class="person-bio">${escapeHtml(person.bio)}</p>` : ""}</div><span class="person-signal"></span></article>`;
}

function renderOperate() {
  const snapshot = store.get();
  app.innerHTML = `<main class="control-shell operate-shell">
    <header class="control-header">${brand(snapshot.config)}<div class="control-actions"><span id="control-sync" class="sync-status"></span><a href="${viewHref("stage", true)}" target="_blank">打开可操作大屏 ↗</a><a href="${viewHref("admin", true)}">配置后台</a></div></header>
    <section class="operate-layout">
      <div class="control-main"><div class="control-kicker">现场按钮页 <span>LIVE OPERATOR</span></div><div id="control-status"></div><div id="control-buttons" class="control-buttons"></div><div class="control-note"><span>提示</span>主要按钮会根据现场进度自动变化。“直接结束活动”会先二次确认。</div></div>
    </section>
  </main>`;
  const status = document.querySelector("#control-status");
  const buttons = document.querySelector("#control-buttons");
  bindConnectionStatus(document.querySelector("#control-sync"));
  store.subscribe((next) => {
    status.innerHTML = controlStatus(next);
    buttons.innerHTML = controlButtons(next);
    bindControlButtons(buttons);
  });
}

function controlStatus(snapshot) {
  const { runtime } = snapshot;
  const group = currentGroup(snapshot);
  const progress = currentActivePosition(snapshot);
  const finished = runtime.phase === "finished";
  return `<div class="control-round"><span>当前进度</span><strong>${finished ? "活动已结束" : `第 ${progress.position} / ${progress.total} 组`}</strong></div>
    <div class="control-phase"><small>${phases[runtime.phase].eyebrow}</small><h1>${phases[runtime.phase].title}</h1><p>${phases[runtime.phase].hint}</p></div>
    <div class="control-results">
      <div><span>问题</span><strong>${finished || !runtime.revealedQuestion ? "尚未揭晓" : escapeHtml(group.question.text)}</strong></div>
      <div><span>回答嘉宾</span><strong>${finished || !runtime.revealedSpeaker ? "尚未登场" : `${escapeHtml(group.speaker.name)} · ${escapeHtml(group.speaker.title)}`}</strong></div>
      <div><span>接力去向</span><strong>${finished ? "活动已结束" : !group.outgoingQuestion && runtime.phase === "complete" ? "主持人收尾" : !runtime.revealedOutgoing ? "尚未展示" : escapeHtml(group.nextSpeaker || "主持人收尾")}</strong></div>
    </div>`;
}

function controlButtons(snapshot) {
  const phase = snapshot.runtime.phase;
  const waiting = phase.startsWith("drawing");
  return `<button class="control-primary" data-action="advance" ${waiting || phase === "finished" ? "disabled" : ""}>${nextLabel(snapshot)} <span>→</span></button>
    <div class="control-secondary">
      <button data-action="reset">重置整场活动</button>
      <button class="danger-button" data-action="finish" ${phase === "finished" ? "disabled" : ""}>直接结束活动</button>
    </div>`;
}

function bindControlButtons(container) {
  container.querySelector('[data-action="advance"]')?.addEventListener("click", advance);
  container.querySelector('[data-action="finish"]')?.addEventListener("click", () => {
    if (confirm("确定直接结束活动吗？所有现场大屏将立即进入结束页面。")) store.finish();
  });
  container.querySelector('[data-action="reset"]')?.addEventListener("click", () => {
    if (confirm("确定清空现场进度并回到第一组吗？")) store.reset();
  });
}

function renderAdmin() {
  const snapshot = store.get();
  app.innerHTML = `<main class="admin-shell">
    <header class="control-header">${brand(snapshot.config)}<div class="control-actions"><span id="admin-sync" class="sync-status"></span><a href="${viewHref("operate", true)}">现场按钮页</a><a href="${viewHref("stage", true)}" target="_blank">打开可操作大屏 ↗</a></div></header>
    <section class="admin-content"><div class="admin-title"><div><small>问题接力配置</small><h1>12位嘉宾接力顺序</h1><p>上一位嘉宾留下的问题，会自动成为下一位嘉宾回答的问题；另有3组备用位置。</p></div><button id="save-config" class="save-button">保存全部修改</button></div><div id="config-editor" class="group-editor"></div></section>
  </main>`;
  const editor = document.querySelector("#config-editor");
  bindConnectionStatus(document.querySelector("#admin-sync"));
  editor.innerHTML = configEditor(snapshot.config);
  bindPhotoEditors(editor);
  document.querySelector("#save-config").addEventListener("click", async () => {
    const button = document.querySelector("#save-config");
    button.disabled = true;
    const saved = await store.updateConfig(readEditor(store.get().config));
    button.textContent = saved ? "已保存并同步" : "保存失败，请检查连接";
    button.disabled = false;
    setTimeout(() => (button.textContent = "保存全部修改"), 1200);
  });
}

function bindConnectionStatus(element) {
  if (!element) return;
  store.subscribeConnection((status) => {
    element.className = `sync-status sync-status--${status.mode} ${status.connected ? "is-connected" : "is-disconnected"}`;
    element.innerHTML = `<i></i>${escapeHtml(status.message)}`;
  });
}

function configEditor(config) {
  return config.groups.map((group, index) => `<article class="group-config ${group.enabled ? "" : "is-disabled"}" data-group-card="${index}">
    <header><div><span>${String(index + 1).padStart(2, "0")}</span><h2>第 ${index + 1} 组</h2></div><label class="group-toggle">参与流程 <input type="checkbox" data-index="${index}" data-field="enabled" ${group.enabled ? "checked" : ""}><i></i></label></header>
    <div class="relay-question-grid"><label class="field"><span>提问人</span><input data-index="${index}" data-path="question" data-field="asker" value="${escapeAttr(group.question.asker)}"></label><label class="field field--wide"><span>本轮中文问题</span><textarea data-index="${index}" data-path="question" data-field="text">${escapeHtml(group.question.text)}</textarea></label><label class="field"><span>提问人英文名</span><input data-index="${index}" data-path="question" data-field="askerEn" value="${escapeAttr(group.question.askerEn || "")}"></label><label class="field field--wide"><span>英文翻译（没有可留空）</span><textarea data-index="${index}" data-path="question" data-field="textEn">${escapeHtml(group.question.textEn || "")}</textarea></label></div>
    <div class="guest-config guest-config--relay">${guestEditor(group.speaker, index, "speaker", "回答嘉宾")}</div>
    <div class="relay-question-grid relay-question-grid--outgoing"><label class="field field--wide"><span>该嘉宾留下的中文问题</span><textarea data-index="${index}" data-field="outgoingQuestion">${escapeHtml(group.outgoingQuestion)}</textarea></label><label class="field"><span>下一位回答嘉宾</span><input data-index="${index}" data-field="nextSpeaker" value="${escapeAttr(group.nextSpeaker)}"></label><label class="field field--wide"><span>该问题英文翻译（没有可留空）</span><textarea data-index="${index}" data-field="outgoingQuestionEn">${escapeHtml(group.outgoingQuestionEn || "")}</textarea></label></div>
  </article>`).join("");
}

function guestEditor(person, index, path, label) {
  const initial = escapeHtml(person.name.trim().slice(0, 1) || "嘉");
  const photo = person.image ? `<img src="${escapeAttr(person.image)}" alt="">` : `<span>${initial}</span>`;
  return `<section class="guest-fields"><h3>${label}</h3><div class="photo-editor"><div class="photo-preview" data-preview="${index}-${path}">${photo}</div><div><label class="upload-button">上传照片<input type="file" accept="image/*" data-photo-input="${index}-${path}"></label><button type="button" class="clear-photo" data-clear-photo="${index}-${path}">清除</button></div><input type="hidden" data-index="${index}" data-path="${path}" data-field="image" value="${escapeAttr(person.image)}"></div><label class="field"><span>姓名</span><input data-index="${index}" data-path="${path}" data-field="name" value="${escapeAttr(person.name)}"></label><label class="field"><span>英文姓名</span><input data-index="${index}" data-path="${path}" data-field="nameEn" value="${escapeAttr(person.nameEn || "")}"></label><label class="field"><span>身份 / 单位 / 职务</span><input data-index="${index}" data-path="${path}" data-field="title" value="${escapeAttr(person.title)}"></label><label class="field field--guest-bio"><span>大屏简介</span><textarea data-index="${index}" data-path="${path}" data-field="bio">${escapeHtml(person.bio || "")}</textarea></label></section>`;
}

function bindPhotoEditors(editor) {
  editor.querySelectorAll("[data-photo-input]").forEach((input) => input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    const [index, path] = input.dataset.photoInput.split("-");
    const dataUrl = await compressImage(file);
    editor.querySelector(`[data-index="${index}"][data-path="${path}"][data-field="image"]`).value = dataUrl;
    editor.querySelector(`[data-preview="${index}-${path}"]`).innerHTML = `<img src="${escapeAttr(dataUrl)}" alt="嘉宾照片预览">`;
  }));
  editor.querySelectorAll("[data-clear-photo]").forEach((button) => button.addEventListener("click", () => {
    const [index, path] = button.dataset.clearPhoto.split("-");
    editor.querySelector(`[data-index="${index}"][data-path="${path}"][data-field="image"]`).value = "";
    editor.querySelector(`[data-preview="${index}-${path}"]`).innerHTML = "<span>嘉</span>";
  }));
  editor.querySelectorAll('[data-field="enabled"]').forEach((input) => input.addEventListener("change", () => {
    editor.querySelector(`[data-group-card="${input.dataset.index}"]`).classList.toggle("is-disabled", !input.checked);
  }));
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, 640 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
      URL.revokeObjectURL(image.src);
    };
    image.onerror = reject;
    image.src = URL.createObjectURL(file);
  });
}

function readEditor(oldConfig) {
  const next = structuredClone(oldConfig);
  document.querySelectorAll("[data-index][data-field]").forEach((input) => {
    const group = next.groups[Number(input.dataset.index)];
    const target = input.dataset.path ? group[input.dataset.path] : group;
    target[input.dataset.field] = input.type === "checkbox" ? input.checked : input.value.trim();
  });
  return next;
}

async function advance() {
  const snapshot = store.get();
  const { phase } = snapshot.runtime;
  const group = currentGroup(snapshot);
  if (phase === "idle") return runReveal("question", "drawingQuestion", "question");
  if (phase === "question") return runReveal("speaker", "drawingSpeaker", "speaker");
  if (phase === "speaker") return store.setPhase("speaking");
  if (phase === "speaking") {
    if (!group.outgoingQuestion) return store.setPhase("complete");
    return store.setPhase("askingQuestion");
  }
  if (phase === "askingQuestion") {
    if (!await store.reveal("outgoing")) return false;
    return store.setPhase("leavingQuestion");
  }
  if (phase === "leavingQuestion") return startNextSpeakerDraw();
  if (phase === "complete") return store.finish();
}

async function startNextSpeakerDraw() {
  const advanced = await store.nextRound("drawingSpeaker");
  if (!advanced) return;
  setTimeout(async () => {
    if (store.get().runtime.phase !== "drawingSpeaker") return;
    if (!await store.reveal("speaker")) return;
    await store.setPhase("speaker");
  }, 2900);
}

async function runReveal(kind, drawingPhase, revealPhase) {
  if (!await store.setPhase(drawingPhase)) return;
  setTimeout(async () => {
    if (store.get().runtime.phase !== drawingPhase) return;
    if (!await store.reveal(kind)) return;
    await store.setPhase(revealPhase);
  }, 1800);
}

function nextLabel(snapshot) {
  const { phase } = snapshot.runtime;
  const group = currentGroup(snapshot);
  return ({ idle: "开始问题接力", question: "抽取回答嘉宾", speaker: "开始嘉宾回答", speaking: group.outgoingQuestion ? "请嘉宾留下问题" : "完成最后一位回答", askingQuestion: "展示嘉宾问题", leavingQuestion: "抽取下一位回答嘉宾", complete: "结束问题接力", finished: "活动已结束" })[phase] || "请稍候";
}

function renderRounds(container, snapshot) {
  const progress = currentActivePosition(snapshot);
  const finished = snapshot.runtime.phase === "finished";
  const position = finished ? progress.total : progress.position;
  const percentage = progress.total ? Math.max(0, Math.min(100, (position / progress.total) * 100)) : 0;
  container.innerHTML = `<div class="rounds-copy"><span>QUESTION RELAY</span><strong>${String(position).padStart(2, "0")} <i>/ ${String(progress.total).padStart(2, "0")}</i></strong></div><div class="rounds-track"><i style="width:${percentage}%"></i></div>`;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function escapeAttr(value = "") {
  return escapeHtml(value).replace(/`/g, "&#96;");
}
