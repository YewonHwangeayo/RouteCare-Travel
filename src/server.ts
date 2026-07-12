import express, { Request, Response, NextFunction } from 'express';

const app = express();
const PORT = process.env.PORT || 8080;

interface AnalyzePlaceRiskArgs {
  location: string;
}

interface PlanTripRouteArgs {
  destination: string;
  days: number;
}

async function analyzePlaceRisk(location: string) {
  return {
    location,
    risk: 'moderate',
    advice: `현재 ${location}에 대한 기본 위험 분석을 완료했습니다. 자세한 정보는 추후 실제 로직으로 대체하세요.`
  };
}

async function planTripRoute(destination: string, days: number) {
  return {
    destination,
    days,
    itinerary: Array.from({ length: days }, (_, index) => ({
      day: index + 1,
      plan: `Day ${index + 1} 일정 생성: ${destination} 주변 명소 탐방`
    }))
  };
}

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
    // ... (이전 코드 유지) ...
    else if (method === "ping") {
      responsePayload = { jsonrpc: "2.0", id, result: {} };
    } 
    // 2단계: 클라이언트에게 제공할 실제 도구 목록을 명시합니다.
    else if (method === "tools/list") {
      responsePayload = {
        jsonrpc: "2.0",
        id,
        result: {
          tools: [
            {
              name: "analyzePlaceRisk",
              description: "특정 여행지의 치안, 날씨 등 위험도를 분석합니다.",
              inputSchema: {
                type: "object",
                properties: {
                  location: { type: "string", description: "분석할 여행지 이름 (예: Shanghai)" }
                },
                required: ["location"]
              }
            },
            {
              name: "planTripRoute",
              description: "최적의 여행 경로를 계획합니다.",
              inputSchema: {
                type: "object",
                properties: {
                  destination: { type: "string", description: "목적지" },
                  days: { type: "number", description: "여행 일수" }
                },
                required: ["destination", "days"]
              }
            }
          ]
        }
      };
    } 
    else if (method === "tools/call") {
      // 클라이언트가 보낸 파라미터 추출
      const { name, arguments: args } = body.params || {};

      try {
        let toolResultData;

        // 이름에 따라 분기 처리
        if (name === "analyzePlaceRisk") {
          toolResultData = await analyzePlaceRisk(args.location);
        } 
        else if (name === "planTripRoute") {
          toolResultData = await planTripRoute(args.destination, args.days);
        } 
        else {
          throw new Error(`알 수 없는 도구입니다: ${name}`);
        }

        // 실행 결과를 JSON 문자열로 변환하여 응답
        responsePayload = {
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              { 
                type: "text", 
                text: JSON.stringify(toolResultData, null, 2) 
              }
            ]
          }
        };
      } catch (error) {
        // 함수 실행 중 에러가 발생한 경우 처리
        responsePayload = { 
          jsonrpc: "2.0", 
          id, 
          error: { code: -32603, message: String(error) } 
        };
      }
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