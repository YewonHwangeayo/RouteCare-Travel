import "dotenv/config";
import cors from "cors";
import express, { type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { registerTools } from "./tools/index.js";
import { createMockProviders } from "./services/mockProviders.js";
import { createRealProvidersFromEnv } from "./services/realProviders.js";

const SERVICE_NAME = "RouteCare Travel";
const PORT = Number(process.env.PORT ?? 8080);

process.on("unhandledRejection", (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  console.error(`${SERVICE_NAME} 처리되지 않은 비동기 오류: ${message}`);
});

process.on("uncaughtException", (error) => {
  console.error(`${SERVICE_NAME} 처리되지 않은 예외: ${error.message}`);
});

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: SERVICE_NAME,
    version: "0.1.0"
  });

  const providers = process.env.PROVIDER_MODE === "real" ? createRealProvidersFromEnv() : createMockProviders();
  registerTools(server, providers);
  return server;
}

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "1mb" }));

const sessions = new Map<string, { server: McpServer; transport: StreamableHTTPServerTransport }>();

app.get("/", (_req: Request, res: Response) => {
  res.json({
    service: SERVICE_NAME,
    status: "ok",
    message: "RouteCare Travel은 MCP 서버입니다. MCP 클라이언트에서 POST /mcp로 연결해 주세요.",
    provider_mode: process.env.PROVIDER_MODE === "real" ? "real" : "mock",
    endpoints: {
      mcp: "/mcp",
      health: "/health"
    }
  });
});

app.get("/.well-known/appspecific/com.chrome.devtools.json", (_req: Request, res: Response) => {
  res.status(204).send();
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, service: SERVICE_NAME });
});

app.post("/mcp", async (req: Request, res: Response) => {
  try {
    const sessionId = req.headers["mcp-session-id"];
    let session = typeof sessionId === "string" ? sessions.get(sessionId) : undefined;

    if (!session) {
      if (!isInitializeRequest(req.body)) {
        res.status(400).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Bad Request: Server not initialized"
          },
          id: null
        });
        return;
      }

      const server = createMcpServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        enableJsonResponse: true,
        onsessioninitialized: (newSessionId) => {
          sessions.set(newSessionId, { server, transport });
        }
      });

      transport.onclose = () => {
        if (transport.sessionId) {
          sessions.delete(transport.sessionId);
        }
      };

      await server.connect(transport);
      session = { server, transport };
    }

    const { transport } = session;
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown MCP transport error";
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message
        },
        id: null
      });
      return;
    }

    res.end();
  }
});

app.get("/mcp", async (req: Request, res: Response) => {
  try {
    const sessionId = req.headers["mcp-session-id"];
    const session = typeof sessionId === "string" ? sessions.get(sessionId) : undefined;

    if (!session) {
      res.status(400).json({ error: "Mcp-Session-Id가 없거나 올바르지 않습니다." });
      return;
    }

    await session.transport.handleRequest(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : "MCP 스트림 처리 오류";
    if (!res.headersSent) {
      res.status(500).json({ error: message });
      return;
    }
    res.end();
  }
});

app.delete("/mcp", async (req: Request, res: Response) => {
  try {
    const sessionId = req.headers["mcp-session-id"];
    const session = typeof sessionId === "string" ? sessions.get(sessionId) : undefined;

    if (!session) {
      res.status(400).json({ error: "Mcp-Session-Id가 없거나 올바르지 않습니다." });
      return;
    }

    await session.transport.handleRequest(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : "MCP 세션 종료 처리 오류";
    if (!res.headersSent) {
      res.status(500).json({ error: message });
      return;
    }
    res.end();
  }
});

const httpServer: Server = app.listen(PORT, () => {
  console.log(`${SERVICE_NAME} MCP 서버가 ${PORT}번 포트에서 실행 중입니다.`);
});

httpServer.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `${SERVICE_NAME} could not start because port ${PORT} is already in use. ` +
        `기존 프로세스를 종료하거나 다른 포트로 실행해 주세요. 예: PORT=8081 npm run dev`
    );
    process.exit(1);
  }

  console.error(`${SERVICE_NAME} 시작 실패: ${error.message}`);
  process.exit(1);
});
