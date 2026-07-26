// Task 9.6: thin per-domain wrapper over HttpClient for the six /v1/auth
// routes (proxied verbatim to services/auth per Decision D20). signup/login/
// refresh/logout are unauthenticated by design (openapi.yaml security: [] on
// each) -- skipAuth: true keeps HttpClient from trying to attach a bearer
// token that doesn't exist yet on these routes.
import type { HttpClient } from './http';
import type {
  AdminPingResponse,
  AuthResult,
  LoginRequest,
  LogoutRequest,
  MeResponse,
  RefreshRequest,
  SignupRequest,
} from './types';

export class AuthClient {
  constructor(private readonly http: HttpClient) {}

  signup(input: SignupRequest): Promise<AuthResult> {
    return this.http.request('POST', '/v1/auth/signup', { body: input, skipAuth: true });
  }

  login(input: LoginRequest): Promise<AuthResult> {
    return this.http.request('POST', '/v1/auth/login', { body: input, skipAuth: true });
  }

  refresh(input: RefreshRequest): Promise<AuthResult> {
    return this.http.request('POST', '/v1/auth/refresh', { body: input, skipAuth: true });
  }

  /** Idempotent -- resolves even if the token is already revoked/expired. */
  logout(input: LogoutRequest): Promise<void> {
    return this.http.request('POST', '/v1/auth/logout', { body: input, skipAuth: true });
  }

  me(): Promise<MeResponse> {
    return this.http.request('GET', '/v1/auth/me');
  }

  /** RBAC demonstration route -- requires the admin role. */
  adminPing(): Promise<AdminPingResponse> {
    return this.http.request('GET', '/v1/auth/admin/ping');
  }
}
