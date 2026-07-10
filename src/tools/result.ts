export interface ToolSuccess {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
}

export interface ToolError extends ToolSuccess {
  isError: true;
}

export function jsonResult(payload: unknown): ToolSuccess {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }]
  };
}

export function errorResult(error: unknown): ToolError {
  const message = error instanceof Error ? error.message : "알 수 없는 오류";
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: `### RouteCare Travel 도구 오류\n\n${message}\n\n입력 형식을 확인한 뒤 다시 시도해 주세요.`
      }
    ]
  };
}
