import { HttpRequestError } from "./errors";
import type { BrowserAgentConfig, HttpClient } from "./types";

export class ApiHttpClient implements HttpClient {
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;

  constructor(private readonly config: BrowserAgentConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
  }

  async post<TResponse>(path: string, body: unknown): Promise<TResponse> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-enrollment-token": this.config.enrollmentToken,
        "x-organization-id": this.config.organizationId
      },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new HttpRequestError(response.status, data.error ?? "Request failed");
    }
    return data as TResponse;
  }
}
