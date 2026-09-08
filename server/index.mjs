import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInitialState, reduceAction, validState } from "./state.mjs";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const DIST = path.join(ROOT, "dist");
const DATA_DIR = path.resolve(ROOT, process.env.DATA_DIR || "data");
const STATE_FILE = path.join(DATA_DIR, "live-state.json");
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const CONTROL_TOKEN = process.env.CONTROL_TOKEN || "";
const clients = new Set();
let state = await loadState();
let actionQueue = Promise.resolve();

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    if (request.method === "GET" && url.pathname === "/api/health") return sendJson(response, 200, { ok: true, revision: state.runtime.revision });
    if (request.method === "GET" && url.pathname === "/api/state") {
      response.setHeader("X-Control-Required", CONTROL_TOKEN ? "1" : "0");
      return sendJson(response, 200, state);
    }
    if (request.method === "GET" && url.pathname === "/api/events") return openEventStream(request, response);
    if (request.method === "POST" && url.pathname === "/api/action") return handleAction(request, response);
    if (request.method === "GET" || request.method === "HEAD") return serveStatic(url.pathname, request.method, response);
    sendJson(response, 405, { error: "Method not allowed" });
  } catch (error) {
    console.error(error);
    if (!response.headersSent) sendJson(response, 500, { error: "Internal server error" });
    else response.end();
  }
});

server.keepAliveTimeout = 65_000;
server.listen(PORT, HOST, () => {
  console.log(`Kanshan live stage listening on http://${HOST}:${PORT}`);
  console.log(CONTROL_TOKEN ? "Operator actions are protected by CONTROL_TOKEN." : "Warning: CONTROL_TOKEN is not set; operator actions are open.");
});

async function loadState() {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    const saved = JSON.parse(await readFile(STATE_FILE, "utf8"));
    if (validState(saved)) return saved;
  } catch {
    // First start or an invalid state file: initialize from the bundled event configuration.
  }
  const config = JSON.parse(await readFile(path.join(DIST, "config", "activity.json"), "utf8"));
  const initial = createInitialState(config);
  await persist(initial);
  return initial;
}

async function handleAction(request, response) {
  if (CONTROL_TOKEN && request.headers["x-control-token"] !== CONTROL_TOKEN) {
    return sendJson(response, 401, { error: "Invalid control token" });
  }
  const command = await readJson(request);
  let result;
  actionQueue = actionQueue.catch(() => {}).then(async () => {
    const next = reduceAction(state, command);
    await persist(next);
    state = next;
    broadcast(state);
    result = state;
  });
  await actionQueue;
  sendJson(response, 200, result);
}

function openEventStream(request, response) {
  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });
  response.write(`data: ${JSON.stringify(state)}\n\n`);
  clients.add(response);
  const heartbeat = setInterval(() => response.write(": keepalive\n\n"), 20_000);
  request.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(response);
  });
}

function broadcast(next) {
  const message = `data: ${JSON.stringify(next)}\n\n`;
  for (const client of clients) client.write(message);
}

async function persist(next) {
  const temporary = `${STATE_FILE}.tmp`;
  await writeFile(temporary, JSON.stringify(next, null, 2));
  await rename(temporary, STATE_FILE);
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 12 * 1024 * 1024) throw new Error("Request body too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function serveStatic(pathname, method, response) {
  const relative = decodeURIComponent(pathname).replace(/^\/+/, "") || "index.html";
  const file = path.resolve(DIST, relative);
  if (file !== DIST && !file.startsWith(`${DIST}${path.sep}`)) return sendJson(response, 403, { error: "Forbidden" });
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error("Not a file");
  } catch {
    return sendJson(response, 404, { error: "Not found" });
  }
  const type = mimeType(file);
  const immutable = /\/assets\/.*-[A-Za-z0-9_-]+\.(js|css)$/.test(file);
  response.writeHead(200, {
    "Content-Type": type,
    "Content-Length": (await stat(file)).size,
    "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-cache"
  });
  if (method === "HEAD") return response.end();
  createReadStream(file).pipe(response);
}

function mimeType(file) {
  return ({
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".webp": "image/webp",
    ".svg": "image/svg+xml"
  })[path.extname(file).toLowerCase()] || "application/octet-stream";
}

function sendJson(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body), "Cache-Control": "no-store" });
  response.end(body);
}
