import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { createInitialState, reduceAction } from "../server/state.mjs";

const required = [
  "index.html",
  "src/main.js",
  "src/defaults.js",
  "src/store.js",
  "src/model.js",
  "server/index.mjs",
  "server/state.mjs",
  "Dockerfile",
  "public/config/activity.json",
  "public/assets/liukanshan-three-quarter-v2.png",
  "public/assets/brand/pujiang-forum-logo-white.png",
  "public/assets/brand/zhihu-logo-white.png"
];

for (const path of required) {
  const info = await stat(path);
  assert.ok(info.size > 0, `${path} should not be empty`);
}

const config = JSON.parse(await readFile("public/config/activity.json", "utf8"));
assert.equal(config.groups.length, 15, "exactly fifteen fixed group slots are required");
for (const group of config.groups) {
  assert.ok(group.question?.text, "each group should bind a question");
  assert.ok(group.speaker?.name && "title" in group.speaker && "image" in group.speaker && "bio" in group.speaker, "each group should bind a complete speaker profile");
  assert.ok("outgoingQuestion" in group && "nextSpeaker" in group, "each group should define the next handoff");
}
assert.equal(config.groups.filter((group) => group.enabled).length, 12, "the confirmed schedule should contain twelve active speakers");
assert.equal(config.groups[11].speaker.name, "孙悦礼", "Sun Yueyue should be the final answering speaker");
assert.equal(config.groups[11].nextSpeaker, "", "the final speaker should hand the stage back to the host");
assert.equal(
  config.groups[10].question.text,
  "面对气候变化和极端水文事件，地下水科学能够发挥哪些独特作用？科学研究又该如何在探索基础规律的同时，回应现实的水安全需求？",
  "Wei Yaqiang should receive the approved groundwater-science question"
);
const relay = config.groups.filter((group) => group.enabled);
for (let index = 0; index < relay.length - 1; index += 1) {
  assert.equal(relay[index].outgoingQuestion, relay[index + 1].question.text, `group ${index + 1} outgoing question should become the next incoming question`);
  assert.equal(relay[index].outgoingQuestionEn, relay[index + 1].question.textEn, `group ${index + 1} English translation should follow the same handoff`);
  assert.equal(relay[index].nextSpeaker, relay[index + 1].speaker.name, `group ${index + 1} should hand off to the next fixed speaker`);
}
for (const group of relay) {
  assert.ok(group.speaker.image.startsWith("./assets/speakers/"), `${group.speaker.name} should use a bundled speaker photo`);
  const photo = await stat(`public/${group.speaker.image.replace(/^\.\//, "")}`);
  assert.ok(photo.size > 1000 && photo.size < 500 * 1024, `${group.speaker.name} photo should be optimized for the web`);
  assert.ok(group.speaker.title && group.speaker.bio && group.speaker.fullBio, `${group.speaker.name} should include stage and full biography data`);
}
assert.ok(relay.filter((group) => group.question.textEn).length >= 4, "bilingual questions should store English separately from Chinese");

let serverState = createInitialState(config);
serverState = reduceAction(serverState, { action: "setPhase", phase: "question" });
assert.equal(serverState.runtime.phase, "question", "the server should own and update the shared stage phase");
const beforeRevision = serverState.runtime.revision;
serverState = reduceAction(serverState, { action: "reveal", kind: "speaker" });
assert.equal(serverState.runtime.revealedSpeaker, true, "server actions should reveal the same fixed speaker for every client");
assert.equal(serverState.runtime.revision, beforeRevision + 1, "every server action should advance the shared revision");

const main = await readFile("src/main.js", "utf8");
for (const phase of ["drawingQuestion", "drawingSpeaker", "speaking", "askingQuestion", "leavingQuestion", "complete"]) {
  assert.ok(main.includes(phase), `main flow should include ${phase}`);
}

const css = await readFile("src/styles.css", "utf8");
assert.ok(!css.includes("fonts.googleapis.com"), "production page should not depend on remote fonts");
assert.ok(css.includes("#056de8"), "event background should use the approved blue");
assert.ok(main.includes("brand-lockup"), "event header should use the official joint logo lockup");
assert.ok(main.includes("pujiang-forum-logo-white.png"), "event header should include the reverse forum logo");
assert.ok(main.includes("zhihu-logo-white.png"), "event header should include the supplied reverse Zhihu logo");
assert.ok(main.includes("brand-divider"), "joint logo lockup should use a quiet divider");
assert.ok(main.includes("准备好了吗，互动马上开始"), "stage opening should use the approved readiness prompt");
assert.ok(main.includes("stage-controls"), "stage should provide a compact on-screen operation dock");
assert.ok(main.includes("stageControlButtons"), "stage controls should follow the current flow state");
assert.ok(main.includes("stage-canvas"), "stage should use a dedicated 16:9 presentation canvas");
assert.ok(main.includes("toggleFullscreen"), "stage should provide fullscreen presentation support");
assert.ok(main.includes("QUESTION RELAY"), "stage should use a compact relay progress indicator");
assert.ok(main.includes('view === "operate"') || main.includes('["operate", "control"]'), "the product should provide a dedicated operator view");
assert.ok(main.includes('view === "admin"'), "the product should provide a separate configuration view");
assert.ok(main.includes("直接结束活动"), "operator view should provide an early finish action");
assert.ok(main.includes("ending-card"), "stage should provide a dedicated ending screen");
assert.ok(main.includes("person-photo"), "guest cards should show profile photos");
assert.ok(main.includes("speakerRouletteMarkup"), "speaker draw should rotate large guest portraits");
assert.ok(main.includes("question-card--prompt"), "speaker draw should retain a readable compact question card");
assert.ok(main.includes("leave-question-prompt"), "leaving a question should have a dedicated prompt screen without the old question");
assert.ok(main.includes("question-asker"), "revealed questions should identify the asking guest with photo and name");
assert.ok(main.includes("kanshan-bubble"), "the stage should give Liu Kanshan a phase-aware speech bubble");
assert.ok(main.includes("kanshanBubble(snapshot)"), "speech bubble copy should follow the manually selected page state");
assert.ok(main.includes("谢谢分享，也请留下一道问题"), "the leave-question bubble should avoid timing-sensitive praise");
assert.ok(main.includes("这个问题，将交给下一位嘉宾"), "the outgoing-question bubble should neutrally guide the next step");
assert.ok(css.includes("kanshan-bubble-pop"), "the speech bubble should animate when the stage state changes");
assert.ok(css.includes("left: -10%; right: auto"), "the speech bubble should sit to Liu Kanshan's upper-left without covering the face");
assert.ok(main.includes("relay-connector"), "question cards should visualize the relay from asker to question");
assert.ok(main.includes("speakerRouletteMarkup") && main.includes("--stop-percent"), "the speaker roulette should decelerate into its fixed result");
assert.ok(main.includes("endingSpeakerStrip"), "the ending photo moment should include all active speakers");
assert.ok(css.includes("speaker-land 2.6s"), "the speaker draw should use a staged landing animation");
assert.ok(css.includes("question-stage-in"), "question reveals should use a dedicated stage entrance");
assert.ok(main.includes("ENGLISH TRANSLATION"), "bilingual questions should show English as a secondary note");
assert.ok(main.includes("person-bio"), "speaker reveal should show a stage biography");
assert.ok(!main.includes("点评专家"), "the relay flow should not contain the former expert-comment phase");
assert.ok(main.includes("question-card--outgoing"), "the relay flow should reveal each speaker's outgoing question");
assert.ok(main.includes('question: "抽取回答嘉宾"'), "the stage button should use a generic first-speaker draw label");
assert.ok(main.includes('leavingQuestion: "抽取下一位回答嘉宾"'), "the stage button should not reveal the next speaker's name");
assert.ok(main.includes('askingQuestion: "展示嘉宾问题"'), "the guest question should be revealed only after the dedicated prompt");
assert.ok(!main.includes("问题交给</span><h2>${escapeHtml(group.nextSpeaker)"), "the public stage should not preview the next fixed speaker");
assert.ok(main.includes('store.nextRound("drawingSpeaker")'), "the next group should enter the guest roulette directly");

const inlineBuilder = await readFile("scripts/inline_build.mjs", "utf8");
assert.ok(inlineBuilder.includes("escapedAssetPath"), "standalone build should inline BASE-prefixed brand assets");
assert.ok(inlineBuilder.includes("speakerAssets"), "standalone build should inline every speaker photo");

const modelCode = await readFile("src/model.js", "utf8");
assert.ok(modelCode.includes("liukanshan-three-quarter-v2.png"), "character should use the approved image-two pose");
for (const motion of ["kanshan-breathe", "kanshan-search", "kanshan-listen", "kanshan-celebrate"]) {
  assert.ok(css.includes(motion), `animated character should include ${motion}`);
}
assert.ok(!modelCode.includes('from "three"'), "character display should not distort the approved pose through 3D rotation");
assert.ok(!modelCode.includes("createScarf"), "the classic Kanshan model should not include a scarf");

const defaultsCode = await readFile("src/defaults.js", "utf8");
assert.ok(defaultsCode.includes("浦江创新论坛 × 知乎"), "stage brand should show the joint event name");
assert.ok(defaultsCode.includes("Y-Hubs 青年科学家"), "stage brand should show the Y-Hubs subtitle");

const storeCode = await readFile("src/store.js", "utf8");
assert.ok(storeCode.includes("Hi～我是刘看山"), "opening copy should introduce Liu Kanshan");
assert.ok(storeCode.includes("currentGroup"), "reveals should resolve from the current fixed group");
assert.ok(!storeCode.includes("Math.random"), "question and guest results should never be randomized");
assert.ok(storeCode.includes("finish()"), "the flow should be able to end before all groups are completed");
assert.ok(storeCode.includes("new EventSource"), "deployed clients should receive server-sent realtime updates");
assert.ok(storeCode.includes('apiUrl("action")'), "operator actions should be sent to the shared server state");
assert.ok(storeCode.includes("subscribeConnection"), "operator pages should show whether realtime synchronization is connected");
const serverCode = await readFile("server/index.mjs", "utf8");
assert.ok(serverCode.includes('"/api/events"') && serverCode.includes("text/event-stream"), "the server should expose an SSE stream for all screens");
assert.ok(serverCode.includes("CONTROL_TOKEN"), "server-side actions should support an operator token");
assert.ok(serverCode.includes("live-state.json"), "the live state should survive a server process restart");
const packageJson = JSON.parse(await readFile("package.json", "utf8"));
assert.equal(packageJson.scripts.start, "node server/index.mjs", "the deployment package should have a single production start command");
assert.ok(css.includes("aspect-ratio: 16 / 9"), "stage composition should preserve a 16:9 aspect ratio");
assert.ok(css.includes("stage-visual"), "stage should include a richer event key-visual layer");

const model = await stat("public/assets/liukanshan-three-quarter-v2.png");
assert.ok(model.size < 5 * 1024 * 1024, "character sprite should stay below 5 MB");

console.log("All product checks passed.");
