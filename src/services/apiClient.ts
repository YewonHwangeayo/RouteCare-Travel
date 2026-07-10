export class ExternalApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExternalApiError";
  }
}

export async function fetchJson<T>(url: URL, timeoutMs = 4500): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new ExternalApiError(`외부 API 응답 오류: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ExternalApiError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : "알 수 없는 외부 API 오류";
    throw new ExternalApiError(message);
  } finally {
    clearTimeout(timeout);
  }
}
