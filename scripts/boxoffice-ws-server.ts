import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";

import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";

type BoxofficeAction = "start" | "stop";

type BoxofficeAuthMessage = {
  type: "boxoffice-auth";
  token: string;
};

type ExtensionStatusMessage = {
  type: "status";
  running: boolean;
  main: string;
  sub?: string;
  isError?: boolean;
  at: number;
};

type ServerBroadcastMessage = {
  type: "boxoffice";
  action: BoxofficeAction;
  payload?: Record<string, unknown>;
};

type ClientInfo = {
  id: string;
  remoteAddress: string | null;
  connectedAt: number;
  authed: boolean;
  lastStatus: ExtensionStatusMessage | null;
};

const port = parseInt(process.env.BOXOFFICE_WS_PORT ?? "3020", 10) || 3020;
const requiredToken = (process.env.BOXOFFICE_WS_TOKEN ?? "").trim() || null;

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return null;
  return JSON.parse(raw) as unknown;
}

function getBearerToken(req: IncomingMessage): string | null {
  const header = req.headers["authorization"];
  if (!header) return null;
  const value = Array.isArray(header) ? header[0] : header;
  const m = value.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

function socketIsOpen(ws: WebSocket): boolean {
  return ws.readyState === ws.OPEN;
}

function safeJsonParse(input: string): unknown | null {
  try {
    return JSON.parse(input) as unknown;
  } catch {
    return null;
  }
}

function isBoxofficeAuthMessage(msg: unknown): msg is BoxofficeAuthMessage {
  if (!msg || typeof msg !== "object") return false;
  const v = msg as Record<string, unknown>;
  return v.type === "boxoffice-auth" && typeof v.token === "string";
}

function isStatusMessage(msg: unknown): msg is ExtensionStatusMessage {
  if (!msg || typeof msg !== "object") return false;
  const v = msg as Record<string, unknown>;
  if (v.type !== "status") return false;
  if (typeof v.running !== "boolean") return false;
  if (typeof v.main !== "string") return false;
  if (typeof v.at !== "number") return false;
  if ("sub" in v && v.sub !== undefined && typeof v.sub !== "string") return false;
  if ("isError" in v && v.isError !== undefined && typeof v.isError !== "boolean") return false;
  return true;
}

function isBroadcastBody(msg: unknown): msg is ServerBroadcastMessage {
  if (!msg || typeof msg !== "object") return false;
  const v = msg as Record<string, unknown>;
  if (v.type !== "boxoffice") return false;
  if (v.action !== "start" && v.action !== "stop") return false;
  if ("payload" in v && v.payload !== undefined) {
    if (!v.payload || typeof v.payload !== "object" || Array.isArray(v.payload)) return false;
  }
  return true;
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
  const path = url.pathname;

  if (req.method === "GET" && path === "/status") {
    const statuses = [...clients.values()].map((c) => ({
      id: c.id,
      remoteAddress: c.remoteAddress,
      connectedAt: c.connectedAt,
      authed: c.authed,
      lastStatus: c.lastStatus,
    }));

    json(res, 200, {
      ok: true,
      connectedClients: clients.size,
      authedClients: statuses.filter((s) => s.authed).length,
      statuses,
    });
    return;
  }

  if (req.method === "POST" && path === "/broadcast") {
    if (requiredToken) {
      const bearer = getBearerToken(req);
      if (!bearer || bearer !== requiredToken) {
        json(res, 401, { ok: false, error: "Unauthorized" });
        return;
      }
    }

    let body: unknown;
    try {
      body = await readJsonBody(req);
    } catch (err) {
      json(res, 400, { ok: false, error: "Invalid JSON body" });
      return;
    }

    if (!isBroadcastBody(body)) {
      json(res, 400, {
        ok: false,
        error:
          'Body must be {"type":"boxoffice","action":"start"|"stop","payload"?:{...}}',
      });
      return;
    }

    const payloadText = JSON.stringify(body);
    let sent = 0;
    for (const [ws, info] of sockets.entries()) {
      if (!info.authed) continue;
      if (!socketIsOpen(ws)) continue;
      ws.send(payloadText);
      sent += 1;
    }

    json(res, 200, { ok: true, sent, connectedClients: clients.size });
    return;
  }

  json(res, 404, { ok: false, error: "Not found" });
});

const wss = new WebSocketServer({ server, path: "/ws" });

const sockets = new Map<WebSocket, ClientInfo>();
const clients = new Map<string, ClientInfo>();
let nextClientId = 1;

function broadcast(message: ServerBroadcastMessage) {
  const payloadText = JSON.stringify(message);
  for (const [ws, info] of sockets.entries()) {
    if (!info.authed) continue;
    if (!socketIsOpen(ws)) continue;
    ws.send(payloadText);
  }
}

wss.on("connection", (ws, req) => {
  const id = `c${nextClientId++}`;
  const info: ClientInfo = {
    id,
    remoteAddress: req.socket.remoteAddress ?? null,
    connectedAt: Date.now(),
    authed: requiredToken ? false : true,
    lastStatus: null,
  };

  sockets.set(ws, info);
  clients.set(id, info);

  let authTimeout: NodeJS.Timeout | null = null;
  if (requiredToken) {
    authTimeout = setTimeout(() => {
      try {
        ws.close(1008, "Auth timeout");
      } catch {
        // ignore
      }
    }, 5000);
  }

  ws.on("message", (data) => {
    const text = typeof data === "string" ? data : data.toString("utf8");
    const msg = safeJsonParse(text);
    if (!msg) return;

    if (requiredToken && !info.authed) {
      if (!isBoxofficeAuthMessage(msg) || msg.token !== requiredToken) {
        ws.close(1008, "Unauthorized");
        return;
      }
      info.authed = true;
      if (authTimeout) clearTimeout(authTimeout);
      authTimeout = null;
      return;
    }

    if (isStatusMessage(msg)) {
      info.lastStatus = msg;
      return;
    }
  });

  ws.on("close", () => {
    if (authTimeout) clearTimeout(authTimeout);
    sockets.delete(ws);
    clients.delete(id);
  });

  ws.on("error", () => {
    // keep server alive; connection will be cleaned up on close
  });
});

server.listen(port, "127.0.0.1", () => {
  const tokenMsg = requiredToken ? "token auth: ON" : "token auth: OFF";
  // eslint-disable-next-line no-console
  console.log(`[boxoffice-ws] listening on http://127.0.0.1:${port} (${tokenMsg})`);
  // eslint-disable-next-line no-console
  console.log(`[boxoffice-ws] websocket: ws://127.0.0.1:${port}/ws`);
});

function shutdown(signal: string) {
  // eslint-disable-next-line no-console
  console.log(`[boxoffice-ws] shutting down (${signal})`);
  try {
    wss.close();
  } catch {
    // ignore
  }
  try {
    server.close(() => process.exit(0));
  } catch {
    process.exit(0);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Allow importing this file without auto-broadcasting, but expose helpers if needed.
export { broadcast };
