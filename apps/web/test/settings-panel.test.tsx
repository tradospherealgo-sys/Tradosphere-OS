import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

// Task 10.6: proves SettingsPanel's Account section renders real data from a
// genuine GET /v1/auth/me round trip (never fabricated), and that its "Log
// out" button performs a real POST /v1/auth/logout round trip and clears the
// local session -- same real-bound-socket philosophy as auth-flow.test.ts,
// applied here to the rendered component rather than the plain auth-actions
// functions. SettingsPanel also renders ThemeToggle, which throws without a
// ThemeProvider ancestor (confirmed by reading src/lib/theme-context.tsx), so
// this test wraps in the exact provider nesting apps/web/src/app/providers.tsx
// uses: <ThemeProvider><AuthProvider>...</AuthProvider></ThemeProvider>.

function readBody(req: import('node:http').IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
  });
}

interface RecordedRequest {
  method: string;
  path: string;
  authorization: string | null;
  body: unknown;
}

function startFakeAuthServer() {
  const requests: RecordedRequest[] = [];

  const server: Server = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const path = req.url ?? '';
    const method = req.method ?? '';
    const authorization = req.headers.authorization ?? null;

    readBody(req).then((body) => {
      requests.push({ method, path, authorization, body });

      if (method === 'GET' && path === '/v1/auth/me') {
        if (authorization !== 'Bearer access-1') {
          res.statusCode = 401;
          res.end(JSON.stringify({ error: 'unauthorized' }));
          return;
        }
        res.statusCode = 200;
        res.end(JSON.stringify({ id: 'u1', email: 'trader@tradosphere.test', role: 'trader' }));
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
  };
}

type SettingsPanelModule = typeof import('../src/components/settings-panel');
type AuthContextModule = typeof import('../src/lib/auth-context');
type ThemeContextModule = typeof import('../src/lib/theme-context');
type TokenStoreModule = typeof import('../src/lib/token-store');

let fakeServer: ReturnType<typeof startFakeAuthServer>;
let SettingsPanel: SettingsPanelModule['SettingsPanel'];
let AuthProvider: AuthContextModule['AuthProvider'];
let ThemeProvider: ThemeContextModule['ThemeProvider'];
let tokenStore: TokenStoreModule;

beforeAll(async () => {
  fakeServer = startFakeAuthServer();
  const baseUrl = await fakeServer.listen();

  // sdk.ts reads NEXT_PUBLIC_API_BASE_URL once at module-evaluation time, so
  // this must be set BEFORE the first dynamic import of anything that
  // transitively imports it.
  process.env.NEXT_PUBLIC_API_BASE_URL = baseUrl;

  ({ SettingsPanel } = await import('../src/components/settings-panel'));
  ({ AuthProvider } = await import('../src/lib/auth-context'));
  ({ ThemeProvider } = await import('../src/lib/theme-context'));
  tokenStore = await import('../src/lib/token-store');
});

afterAll(async () => {
  await fakeServer.close();
});

beforeEach(() => {
  tokenStore.setSession({
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    user: { id: 'u1', email: 'trader@tradosphere.test', role: 'trader' },
  });
  fakeServer.requests.length = 0;
});

afterEach(() => {
  tokenStore.clearSession();
  cleanup();
});

function renderPanel() {
  return render(
    <ThemeProvider>
      <AuthProvider>
        <SettingsPanel />
      </AuthProvider>
    </ThemeProvider>,
  );
}

describe('SettingsPanel', () => {
  it('renders real account info from a genuine GET /v1/auth/me round trip', async () => {
    renderPanel();

    expect(await screen.findByText('trader@tradosphere.test')).toBeTruthy();
    expect(screen.getByText('trader')).toBeTruthy();
    expect(screen.getByText('u1')).toBeTruthy();

    const meRequest = fakeServer.requests.find((r) => r.path === '/v1/auth/me');
    expect(meRequest).toBeDefined();
    expect(meRequest?.authorization).toBe('Bearer access-1');
  });

  it('renders the theme toggle and the not-yet-available disclosure', async () => {
    renderPanel();

    await screen.findByText('trader@tradosphere.test');
    expect(screen.getByText('Not yet available')).toBeTruthy();
    expect(
      screen.getByText(/Profile editing, password changes, and notification preferences/),
    ).toBeTruthy();
  });

  it('logging out performs a real POST /v1/auth/logout round trip and clears the local session', async () => {
    renderPanel();

    await screen.findByText('trader@tradosphere.test');
    fakeServer.requests.length = 0;

    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));

    await waitFor(() => {
      const logoutRequest = fakeServer.requests.find((r) => r.path === '/v1/auth/logout');
      expect(logoutRequest).toBeDefined();
      expect(logoutRequest?.body).toEqual({ refreshToken: 'refresh-1' });
    });

    expect(tokenStore.getSession()).toBeNull();
  });
});
