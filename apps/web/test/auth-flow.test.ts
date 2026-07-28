import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// Task 10.1: proves login()/restoreSession()/logout() genuinely round-trip
// through @tradosphere/sdk's real HTTP transport, against a real bound
// stand-in server implementing the /v1/auth contract -- mirrors
// apps/api/test/app.test.ts's startFakeUpstream() and the Blocker-B17
// real-bound-socket pattern in apps/api/test/sdk.test.ts. We deliberately do
// NOT import apps/api's buildApp here: apps/web only ever depends on
// @tradosphere/sdk, never on another workspace app, per the one-directional
// service-isolation convention (D9/D12/D17/D18).

interface RecordedRequest {
  method: string;
  path: string;
  authorization: string | null;
  body: unknown;
}

type MeBehavior = 'ok' | 'unauthorized';

function startFakeAuthServer() {
  const requests: RecordedRequest[] = [];
  let meBehavior: MeBehavior = 'ok';

  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      const body = raw ? JSON.parse(raw) : undefined;
      const authorization = req.headers.authorization ?? null;
      const path = req.url ?? '';
      const method = req.method ?? '';
      requests.push({ method, path, authorization, body });

      res.setHeader('Content-Type', 'application/json');

      if (method === 'POST' && path === '/v1/auth/login') {
        const { email, password } = (body ?? {}) as { email?: string; password?: string };
        if (email === 'trader@tradosphere.test' && password === 'correct-horse') {
          res.statusCode = 200;
          res.end(
            JSON.stringify({
              accessToken: 'access-1',
              refreshToken: 'refresh-1',
              user: { id: 'u1', email, role: 'trader' },
            }),
          );
        } else {
          res.statusCode = 401;
          res.end(JSON.stringify({ error: 'invalid credentials' }));
        }
        return;
      }

      if (method === 'GET' && path === '/v1/auth/me') {
        if (meBehavior === 'unauthorized' || authorization !== 'Bearer access-1') {
          res.statusCode = 401;
          res.end(JSON.stringify({ error: 'unauthorized' }));
          return;
        }
        res.statusCode = 200;
        res.end(JSON.stringify({ id: 'u1', email: 'trader@tradosphere.test', role: 'trader' }));
        return;
      }

      if (method === 'POST' && path === '/v1/auth/refresh') {
        res.statusCode = 200;
        res.end(
          JSON.stringify({
            accessToken: 'access-2',
            refreshToken: 'refresh-2',
            user: { id: 'u1', email: 'trader@tradosphere.test', role: 'trader' },
          }),
        );
        return;
      }

      if (method === 'POST' && path === '/v1/auth/logout') {
        res.statusCode = 200;
        res.end(JSON.stringify({}));
        return;
      }

      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'not found' }));
    });
  });

  return {
    async listen(): Promise<string> {
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const { port } = server.address() as AddressInfo;
      return `http://127.0.0.1:${port}`;
    },
    close(): Promise<void> {
      return new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
    requests,
    setMeBehavior(behavior: MeBehavior) {
      meBehavior = behavior;
    },
  };
}

type AuthActionsModule = typeof import('../src/lib/auth-actions');
type TokenStoreModule = typeof import('../src/lib/token-store');

let fakeServer: ReturnType<typeof startFakeAuthServer>;
let authActions: AuthActionsModule;
let tokenStore: TokenStoreModule;

beforeAll(async () => {
  fakeServer = startFakeAuthServer();
  const baseUrl = await fakeServer.listen();

  // sdk.ts reads NEXT_PUBLIC_API_BASE_URL once at module-evaluation time,
  // so this must be set BEFORE the first dynamic import of anything that
  // transitively imports it.
  process.env.NEXT_PUBLIC_API_BASE_URL = baseUrl;

  authActions = await import('../src/lib/auth-actions');
  tokenStore = await import('../src/lib/token-store');
});

afterAll(async () => {
  await fakeServer.close();
});

beforeEach(() => {
  tokenStore.clearSession();
  fakeServer.requests.length = 0;
  fakeServer.setMeBehavior('ok');
});

afterEach(() => {
  tokenStore.clearSession();
});

describe('login()', () => {
  it('round-trips real credentials through the SDK and persists the session', async () => {
    const session = await authActions.login('trader@tradosphere.test', 'correct-horse');

    expect(session.accessToken).toBe('access-1');
    expect(session.refreshToken).toBe('refresh-1');
    expect(session.user).toEqual({ id: 'u1', email: 'trader@tradosphere.test', role: 'trader' });

    const loginRequest = fakeServer.requests.find((r) => r.path === '/v1/auth/login');
    expect(loginRequest).toBeDefined();
    expect(loginRequest?.body).toEqual({
      email: 'trader@tradosphere.test',
      password: 'correct-horse',
    });

    const stored = tokenStore.getSession();
    expect(stored?.accessToken).toBe('access-1');
    expect(stored?.refreshToken).toBe('refresh-1');
  });

  it('throws a clean error and stores no session on invalid credentials', async () => {
    await expect(
      authActions.login('trader@tradosphere.test', 'wrong-password'),
    ).rejects.toMatchObject({
      message: 'Incorrect email or password.',
    });

    expect(tokenStore.getSession()).toBeNull();
  });
});

describe('restoreSession()', () => {
  it('attaches the bearer token to a real /v1/auth/me call and returns the session', async () => {
    await authActions.login('trader@tradosphere.test', 'correct-horse');
    fakeServer.requests.length = 0;

    const session = await authActions.restoreSession();

    expect(session?.user).toEqual({ id: 'u1', email: 'trader@tradosphere.test', role: 'trader' });
    const meRequest = fakeServer.requests.find((r) => r.path === '/v1/auth/me');
    expect(meRequest?.authorization).toBe('Bearer access-1');
  });

  it('performs exactly one refresh-then-persist cycle when the access token is rejected', async () => {
    await authActions.login('trader@tradosphere.test', 'correct-horse');
    fakeServer.setMeBehavior('unauthorized');
    fakeServer.requests.length = 0;

    const session = await authActions.restoreSession();

    expect(session?.user).toEqual({ id: 'u1', email: 'trader@tradosphere.test', role: 'trader' });
    expect(session?.accessToken).toBe('access-2');
    expect(session?.refreshToken).toBe('refresh-2');

    const refreshRequests = fakeServer.requests.filter((r) => r.path === '/v1/auth/refresh');
    expect(refreshRequests).toHaveLength(1);
    expect(refreshRequests[0].body).toEqual({ refreshToken: 'refresh-1' });

    const stored = tokenStore.getSession();
    expect(stored?.accessToken).toBe('access-2');
    expect(stored?.refreshToken).toBe('refresh-2');
  });

  it('returns null and makes zero HTTP requests when no local session exists', async () => {
    const session = await authActions.restoreSession();

    expect(session).toBeNull();
    expect(fakeServer.requests).toHaveLength(0);
  });
});

describe('logout()', () => {
  it('clears the local session and posts the refresh token to the real /v1/auth/logout endpoint', async () => {
    await authActions.login('trader@tradosphere.test', 'correct-horse');
    fakeServer.requests.length = 0;

    await authActions.logout();

    const logoutRequest = fakeServer.requests.find((r) => r.path === '/v1/auth/logout');
    expect(logoutRequest).toBeDefined();
    expect(logoutRequest?.body).toEqual({ refreshToken: 'refresh-1' });
    expect(tokenStore.getSession()).toBeNull();
  });
});
