/**
 * MCP 프로토콜 비즈니스 로직 핸들러
 */
async function handleMcpRequest(body: any) {
  const { method, id } = body;

  // 1. [핵심] MCP 초기화 요청 대응 (PlayMCP 필수 버전 규격 포함)
  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2025-03-26", // 공모전 필수 조건 (최소 지원버전)
        capabilities: {
          tools: {} // 도구(Tools)를 지원한다고 명시
        },
        serverInfo: {
          name: "route-care-mcp", // kakao 단어 절대 포함 금지
          version: "1.0.0"
        }
      }
    };
  }

  // 2. 초기화 완료 알림 (id가 없는 Notification 처리)
  if (method === "notifications/initialized") {
    return { jsonrpc: "2.0" }; // 에러 없이 200 상태코드만 반환
  }

  // 3. 서버 생존 확인 (Ping)
  if (method === "ping") {
    return { jsonrpc: "2.0", id, result: {} };
  }

  // 4. 도구 목록 조회 (기존 작성 코드)
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

  // 5. 도구 실행 (기존 작성 코드)
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

  // 위 조건에 해당하지 않는 알 수 없는 명령일 경우 예외 처리
  return {
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: "Method not found" }
  };
}