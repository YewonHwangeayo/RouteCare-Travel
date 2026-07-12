import express, { Request, Response, NextFunction } from 'express';

const app = express();
// Dockerfile에서 ENV PORT=8080을 선언했으므로 이를 그대로 받아서 사용합니다.
const PORT = process.env.PORT || 8080;

app.use(express.json());
app.use(express.text());

// 1. CORS 헤더 미들웨어
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");
  
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

// 2. GET 요청 (SSE 연결)
app.get('/api/mcp', (req: Request, res: Response) => {
  const sessionId = Math.random().toString(36).substring(2, 15);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");

  const host = req.headers.host;
  const postUrl = `http://${host}/api/mcp?sessionId=${sessionId}`;

  res.write(`event: endpoint\ndata: ${postUrl}\n\n`);

  const interval = setInterval(() => {
    res.write(`:\n\n`); // Ping
  }, 15000);

  req.on("close", () => {
    clearInterval(interval);
    res.end();
  });
});

// 3. POST 요청 (MCP 명령 처리)
app.post('/api/mcp', async (req: Request, res: Response) => {
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { method, id } = body;
    let responsePayload: any;

    if (method === "initialize") {
      responsePayload = {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2025-03-26",
          capabilities: { tools: {} },
          serverInfo: { name: "route-care-mcp", version: "1.0.0" }
        }
      };
    } 
    else if (method === "notifications/initialized") {
      responsePayload = { jsonrpc: "2.0" };
    } 
    else if (method === "ping") {
      responsePayload = { jsonrpc: "2.0", id, result: {} };
    } 
    else if (method === "tools/list") {
      responsePayload = {
        jsonrpc: "2.0",
        id,
        result: {
          tools: [
            {
              name: "calculate_accessible_route", 
              description: "Calculates the optimal accessible travel route based on mobility constraints (e.g., wheelchair, luggage) and real-time crowd data using RouteCareTravel(루트케어트래블).",
              inputSchema: {
                type: "object",
                properties: {
                  origin: { type: "object", description: "Departure location address and category" },
                  stops: { type: "array", description: "List of stopover locations to visit" },
                  constraints: { type: "object", description: "교통약자 제약 조건" }
                },
                required: ["origin", "stops"]
              },
              annotations: {
                title: "Calculate Accessible Route",
                readOnlyHint: true,
                destructiveHint: false,
                openWorldHint: false,
                idempotentHint: true
              }
            }
          ]
        }
      };
    } 
    else if (method === "tools/call") {
      // 💡 실제 경로 계산 비즈니스 로직 삽입
      responsePayload = {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify({ status: "success", summary: "무장애 경로 계산이 완료되었습니다." }) }]
        }
      };
    } 
    else {
      responsePayload = { jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } };
    }

    res.status(200).json(responsePayload);
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.listen(PORT, () => {
  console.log(`MCP Server running on port ${PORT}`);
});