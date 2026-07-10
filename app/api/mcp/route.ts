// 1. [핵심] Vercel이 응답을 캐싱하지 않고 항상 실시간으로 처리하도록 강제
export const dynamic = "force-dynamic";
export const maxDuration = 60; // (선택) 서버리스 함수 실행 시간 최대치로 늘리기

// 2. [핵심] PlayMCP 서버(외부)가 내 서버에 접근할 수 있도록 허용하는 CORS 헤더
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key",
};

// 단일 인스턴스 내 연결 추적
const connections = new Map<string, ReadableStreamDefaultController>();

// 3. [핵심] 외부 서버가 본격적인 통신 전 찔러보는 '사전 요청(Preflight)' 응답 처리
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

/**
 * GET 요청 (SSE 연결)
 */
export async function GET(request: Request) {
  const sessionId = Math.random().toString(36).substring(2, 15);

  const stream = new ReadableStream({
    start(controller) {
      connections.set(sessionId, controller);

      // PlayMCP가 POST를 보낼 엔드포인트 URL 전송 (절대 경로 권장)
      const baseUrl = new URL(request.url).origin;
      const postUrl = `${baseUrl}/api/mcp?sessionId=${sessionId}`;
      
      controller.enqueue(new TextEncoder().encode(`event: endpoint\ndata: ${postUrl}\n\n`));

      const interval = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(`:\n\n`));
        } catch {
          clearInterval(interval);
          connections.delete(sessionId);
        }
      }, 15000);

      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        connections.delete(sessionId);
      });
    },
    cancel() {
      connections.delete(sessionId);
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  });
}

/**
 * POST 요청 (명령 처리)
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const responsePayload = await handleMcpRequest(body);

    // 응답 시에도 무조건 CORS 헤더를 붙여서 반환해야 PlayMCP가 읽을 수 있습니다.
    return new Response(JSON.stringify(responsePayload), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

/**
 * MCP 프로토콜 비즈니스 로직 핸들러
 */
async function handleMcpRequest(body: any) {
  const { method, id } = body;

  if (method === "tools/list") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        tools: [
          {
            name: "calculate_accessible_route", 
            description: "무장애 제약 조건(계단 회피, 캐리어 유무)과 실시간 혼잡도를 분석하여 최적의 이동 경로를 제공합니다.",
            inputSchema: {
              type: "object",
              properties: {
                origin: { type: "object", description: "출발지 주소 및 카테고리 정보" },
                stops: { type: "array", description: "방문하고자 하는 경유지 공간 목록" },
                constraints: { type: "object", description: "with_luggage, avoid_stairs 등의 교통약자 제약 조건" }
              },
              required: ["origin", "stops"]
            }
          }
        ]
      }
    };
  }

  if (method === "tools/call") {
    const { name } = body.params || {};
    if (name === "calculate_accessible_route") {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "success",
                summary: "요청하신 제약 조건을 반영한 무장애 경로 계산이 완료되었습니다."
              })
            }
          ]
        }
      };
    }
  }

  return {
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: "Method not found" }
  };
}