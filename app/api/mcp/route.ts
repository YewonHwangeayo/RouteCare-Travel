// 런타임 중에 단일 인스턴스 내 연결을 추적하기 위한 맵
const connections = new Map<string, ReadableStreamDefaultController>();

/**
 * 1. GET 요청: PlayMCP 플랫폼과 무중단 SSE 스트림 연결을 수립합니다.
 */
export async function GET(request: Request) {
  const sessionId = Math.random().toString(36).substring(2, 15);

  const stream = new ReadableStream({
    start(controller) {
      connections.set(sessionId, controller);

      // [중요] PlayMCP 필수 스펙: 클라이언트가 앞으로 POST 요청을 보낼 엔드포인트 URL을 알립니다.
      const postUrl = `/api/mcp?sessionId=${sessionId}`;
      controller.enqueue(new TextEncoder().encode(`event: endpoint\ndata: ${postUrl}\n\n`));

      // 연결 유지를 위한 주기적인 주석(Keep-Alive Ping) 전송
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
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  });
}

/**
 * 2. POST 요청: PlayMCP가 보낸 JSON-RPC 명령(도구 목록 조회, 도구 실행 등)을 처리합니다.
 */
export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId");
    const body = await request.json();

    // MCP 프로토콜 규칙에 따라 비즈니스 로직 처리
    const responsePayload = await handleMcpRequest(body);

    // 방법 A: SSE 스트림이 현재 인스턴스에 살아있다면 스트림으로 메시지 전송 (표준 스펙)
    if (sessionId && connections.has(sessionId)) {
      const controller = connections.get(sessionId);
      controller?.enqueue(
        new TextEncoder().encode(`event: message\ndata: ${JSON.stringify(responsePayload)}\n\n`)
      );
    }

    // 방법 B: POST 응답 바디에 바로 결과를 실어 반환합니다.
    return new Response(JSON.stringify(responsePayload), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/**
 * 3. MCP 프로토콜 비즈니스 로직 핸들러
 * [주의] 여기 정의된 Tool Name이나 내부 필드에 절대 "kakao" 단어가 들어가면 안 됩니다.
 */
async function handleMcpRequest(body: any) {
  const { method, id } = body;

  // 플레이어에게 제공할 기능(Tool) 목록 반환
  if (method === "tools/list") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        tools: [
          {
            name: "calculate_accessible_route", // 'kakao' 접두사/접미사 금지 정책 준수
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

  // 실제 챗봇이 도구를 호출했을 때 실행되는 로직
  if (method === "tools/call") {
    const { name, arguments: args } = body.params || {};

    if (name === "calculate_accessible_route") {
      // 💡 질문자님이 기존에 작성해두신 핵심 도로/경로 분석 비즈니스 로직을 여기에 연결하세요.
      // 예시용 표준 가이드 응답 서식입니다.
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "success",
                summary: "요청하신 제약 조건을 반영한 무장애 경로 계산이 완료되었습니다.",
                details: "계단을 회피하여 엘리베이터 위주의 보행 도로를 탐색했습니다."
              })
            }
          ]
        }
      };
    }
  }

  // 지원하지 않는 메서드 예외 처리
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code: -32601,
      message: "Method not found"
    }
  };
}