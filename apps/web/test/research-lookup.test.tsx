import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

// Task 10.3: proves ResearchLookup genuinely round-trips GET
// /v1/research/fundamentals/{symbol} through the real SDK/HTTP transport
// against a real bound stand-in server -- same real-bound-socket philosophy
// as auth-flow.test.ts and market-stream.test.ts, applied here to a React
// component via @testing-library/react instead of mocking the SDK.

function startFakeResearchServer() {
  const server: Server = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const url = req.url ?? '';

    if (req.method === 'GET' && url === '/v1/research/fundamentals/RELIANCE') {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          status: 'ok',
          symbol: 'RELIANCE',
          peRatio: 24.5,
          debtToEquity: 0.41,
          revenueGrowthYoyPct: 8.2,
          netProfitMarginPct: 11.7,
          verdict: 'stable',
          generatedAtIso: new Date().toISOString(),
        }),
      );
      return;
    }

    if (req.method === 'GET' && url === '/v1/research/fundamentals/UNKNOWN') {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          status: 'gap',
          reason: 'missing_fundamentals',
          detail: 'nothing ingested yet',
        }),
      );
      return;
    }

    if (req.method === 'GET' && url === '/v1/research/fundamentals/BOOM') {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'internal error' }));
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'not found' }));
  });

  return {
    async listen(): Promise<string> {
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const { port } = server.address() as AddressInfo;
      return `http://127.0.0.1:${port}`;
    },
    close(): Promise<void> {
      return new Promise((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    },
  };
}

type ResearchLookupModule = typeof import('../src/components/research-lookup');

let fakeServer: ReturnType<typeof startFakeResearchServer>;
let ResearchLookup: ResearchLookupModule['ResearchLookup'];

beforeAll(async () => {
  fakeServer = startFakeResearchServer();
  const baseUrl = await fakeServer.listen();
  process.env.NEXT_PUBLIC_API_BASE_URL = baseUrl;
  ({ ResearchLookup } = await import('../src/components/research-lookup'));
});

afterEach(() => cleanup());

afterAll(async () => {
  await fakeServer.close();
});

describe('<ResearchLookup />', () => {
  it('renders a real "ok" fundamentals result from the gateway', async () => {
    render(<ResearchLookup />);

    fireEvent.change(screen.getByLabelText('Symbol'), { target: { value: 'reliance' } });
    fireEvent.click(screen.getByRole('button', { name: /look up/i }));

    await waitFor(() => expect(screen.getByText('stable')).toBeTruthy());
    expect(screen.getByText('24.50')).toBeTruthy();
  });

  it('renders the real "gap" state when nothing has been ingested', async () => {
    render(<ResearchLookup />);

    fireEvent.change(screen.getByLabelText('Symbol'), { target: { value: 'unknown' } });
    fireEvent.click(screen.getByRole('button', { name: /look up/i }));

    await waitFor(() =>
      expect(screen.getByText(/no fundamentals have been ingested/i)).toBeTruthy(),
    );
  });

  it('renders an explicit error state on a real server failure, never fabricated data', async () => {
    render(<ResearchLookup />);

    fireEvent.change(screen.getByLabelText('Symbol'), { target: { value: 'boom' } });
    fireEvent.click(screen.getByRole('button', { name: /look up/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  });
});
