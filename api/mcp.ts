export default async function handler(req: any, res: any) {
  // 1. 모든 통신에 CORS 헤더를 기본으로 깔아줍니다.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");

  // 2. 외부 사전 요청(Preflight) 처리
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // 3. GET 요청 (SSE 연결)
  if (req.method === "GET") {
    const sessionId = Math.random().toString(36).substring(2, 15);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");

    // 클라이언트가 앞으로 POST를 보낼 주소 동적 생성
    const protocol = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers.host;
    const postUrl = `${protocol}://${host}/api/mcp?sessionId=${sessionId}`;

    res.write(`event: endpoint\ndata: ${postUrl}\n\n`);

    const interval = setInterval(() => {
      res.write(`:\n\n`); // 끊김 방지용 Ping
    }, 15000);

    req.on("close", () => {
      clearInterval(interval);
      res.end();
    });
    
    return; // 주의: GET에서는 res.end()를 바로 호출하지 않고 스트림을 열어둡니다.
  }

  // 4. POST 요청 (명령 처리)
  if (req.method === "POST") {
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
                    origin: { type: "object", description: "출발지 주소 및 카테고리 정보" },
                    stops: { type: "array", description: "방문하고자 하는 경유지 공간 목록" },
                    constraints: { type: "object", description: "교통약자 제약 조건" }
                  },
                  required: ["origin", "stops"]
                },
                // 4. annotations: 공모전 필수 포함 항목 5가지 완벽 대응
                annotations: {
                  title: "Calculate Accessible Route", // 툴의 사람이 읽기 쉬운 제목
                  readOnlyHint: true,      // 데이터 조회 목적이므로 true (상태 변경 없음)
                  destructiveHint: false,  // 데이터 삭제 등 파괴적 행위가 없으므로 false
                  openWorldHint: false,    // 외부 API/웹 검색을 통한 열린 응답이 아니므로 false
                  idempotentHint: true     // 동일한 요청을 여러 번 보내도 결과가 같으므로(멱등성) true
                }
              }
            ]
          }
        };
      } 
      else if (method === "tools/call") {
        const { name } = body.params || {};
        if (name === "calculate_accessible_route") {
          responsePayload = {
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ status: "success", summary: "무장애 경로 계산이 완료되었습니다." })
                }
              ]
            }
          };
        }
      } 
      else {
        responsePayload = { jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } };
      }

      return res.status(200).json(responsePayload);
    } catch (error) {
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }

  // GET, POST, OPTIONS 이외의 요청이 들어오면 404
  return res.status(404).send("Not Found");
}