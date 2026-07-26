// Task 9.6, Decision D19 sub-part (9): the SDK's one and only transport
// layer. Every domain module (auth.ts, portfolio.ts, ...) calls through
// HttpClient#request -- none of them touch fetch/URL/headers directly. This
// keeps token injection, query-string building, and error normalization in
// exactly one place, mirroring Forge's charter rule 4 (external calls always
// go through a single adapter, never scattered raw calls) even though the
// "external call" here is the SDK's own outbound call to the gateway rather
// than a broker.

import type { ErrorResponse, ValidationFailure } from './types';

export type SdkErrorBody = ErrorResponse | ValidationFailure | undefined;

/**
 * Thrown for every non-2xx gateway response. Callers can narrow `body` by
 * checking for a `details` array (ValidationFailure) vs. a bare `error`
 * string (ErrorResponse) -- the same two shapes openapi.yaml documents for
 * every route's error responses.
 */
export class SdkHttpError extends Error {
  readonly status: number;
  readonly body: SdkErrorBody;

  constructor(status: number, body: SdkErrorBody, message?: string) {
    super(message ?? (body && 'error' in (body as object) ? (body as ErrorResponse).error : `HTTP ${status}`));
    this.name = 'SdkHttpError';
    this.status = status;
    this.body = body;
  }
}

export type QueryValue = string | number | boolean | undefined | null;

export interface RequestOptions {
  query?: Record<string, QueryValue>;
  body?: unknown;
  /** Skip Authorization header injection even if getAccessToken is configured. */
  skipAuth?: boolean;
}

export interface SdkConfig {
  /** e.g. "http://localhost:4000" -- no trailing slash, no /v1 suffix. */
  baseUrl: string;
  /**
   * Returns the current bearer access token, or undefined/null if the
   * caller is unauthenticated. May be async (e.g. reading from a refreshed
   * token store). Not called for routes flagged with skipAuth.
   */
  getAccessToken?: () => string | undefined | null | Promise<string | undefined | null>;
  /** Override for testing; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

function buildUrl(baseUrl: string, path: string, query?: Record<string, QueryValue>): string {
  const url = new URL(path.replace(/^\//, ''), baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export class HttpClient {
  constructor(private readonly config: SdkConfig) {}

  async request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const doFetch = this.config.fetchImpl ?? fetch;
    const url = buildUrl(this.config.baseUrl, path, options.query);

    const headers: Record<string, string> = {};
    if (options.body !== undefined) {
      headers['content-type'] = 'application/json';
    }
    if (!options.skipAuth && this.config.getAccessToken) {
      const token = await this.config.getAccessToken();
      if (token) headers.authorization = `Bearer ${token}`;
    }

    const response = await doFetch(url, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    // 204 No Content and empty bodies never carry JSON -- return undefined
    // rather than attempting response.json() on an empty stream.
    const rawText = response.status === 204 ? '' : await response.text();
    const parsed: unknown = rawText.length > 0 ? JSON.parse(rawText) : undefined;

    if (!response.ok) {
      throw new SdkHttpError(response.status, parsed as SdkErrorBody);
    }

    return parsed as T;
  }

  /**
   * For the three infra routes that are never JSON (/metrics is Prometheus
   * text exposition, /openapi.yaml is YAML, /documentation is HTML) --
   * JSON.parse would throw on all three, so this bypasses body parsing
   * entirely and returns the raw response text.
   */
  async requestText(path: string): Promise<string> {
    const doFetch = this.config.fetchImpl ?? fetch;
    const url = buildUrl(this.config.baseUrl, path);
    const response = await doFetch(url, { method: 'GET' });
    const text = await response.text();
    if (!response.ok) {
      throw new SdkHttpError(response.status, undefined, `HTTP ${response.status} fetching ${path}`);
    }
    return text;
  }
}
