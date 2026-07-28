import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

// Task 10.4: proves PortfolioDashboard genuinely round-trips GET
// /v1/portfolio/summary, /performance, /allocation, /risk through the real
// SDK/HTTP transport against a real bound stand-in server -- same
// real-bound-socket philosophy as research-lookup.test.tsx. Each section is
// served by its own real endpoint so a per-section failure (risk fails here)
// proves sections render/fail independently rather than one call blanking
// the whole dashboard.

function startFakeServer() {
  const server: Server = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const url = req.url ?? '';

    if (req.method === 'GET' && url === '/v1/portfolio/summary') {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          cashBalance: 50000,
          positionsValue: 12500,
          realizedPnl: 300,
          unrealizedPnl: -50,
          totalEquity: 62500,
          positions: [
            { symbol: 'RELIANCE', direction: 'long', quantity: 5, averageEntryPrice: 2450 },
          ],
          missingPriceSymbols: [],
        }),
      );
      return;
    }

    if (req.method === 'GET' && url === '/v1/portfolio/performance') {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          startingCash: 50000,
          totalEquity: 62500,
          totalReturn: 12500,
          totalReturnPct: 25,
          realizedPnl: 300,
          unrealizedPnl: -50,
        }),
      );
      return;
    }

    if (req.method === 'GET' && url === '/v1/portfolio/allocation') {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          allocation: [
            { symbol: 'RELIANCE', direction: 'long', marketValue: 12500, allocationPct: 20 },
          ],
          missingPriceSymbols: ['TCS'],
        }),
      );
      return;
    }

    if (req.method === 'GET' && url === '/v1/portfolio/risk') {
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

type PortfolioDashboardModule = typeof import('../src/components/portfolio-dashboard');

let fakeServer: ReturnType<typeof startFakeServer>;
let PortfolioDashboard: PortfolioDashboardModule['PortfolioDashboard'];

beforeAll(async () => {
  fakeServer = startFakeServer();
  const baseUrl = await fakeServer.listen();
  process.env.NEXT_PUBLIC_API_BASE_URL = baseUrl;
  ({ PortfolioDashboard } = await import('../src/components/portfolio-dashboard'));
});

afterEach(() => cleanup());

afterAll(async () => {
  await fakeServer.close();
});

describe('<PortfolioDashboard />', () => {
  it('renders real summary, performance, and allocation data, and an explicit error for the failing risk section', async () => {
    render(<PortfolioDashboard />);

    await waitFor(() => expect(screen.getByText(/62500\.00/)).toBeTruthy());
    await waitFor(() => expect(screen.getByText(/25\.00%/)).toBeTruthy());
    await waitFor(() => expect(screen.getAllByText(/RELIANCE/).length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.getByText(/TCS/)).toBeTruthy());
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));
  });
});
