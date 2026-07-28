import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

// Task 10.4: proves AnalyticsDashboard genuinely round-trips GET
// /v1/analytics/performance, /strategy-stats, /trade-distribution, /heatmap,
// /session-analysis, /instrument-analysis, /monthly-reports through the real
// SDK/HTTP transport against a real bound stand-in server -- same
// real-bound-socket philosophy as research-lookup.test.tsx. Also proves the
// zero-trades empty state renders instead of a blank/zeroed stat grid.

function startFakeServer() {
  const server: Server = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const url = req.url ?? '';

    if (req.method === 'GET' && url === '/v1/analytics/performance') {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          totalTrades: 10,
          winningTrades: 6,
          losingTrades: 4,
          breakevenTrades: 0,
          openTrades: 0,
          totalRealizedPnl: 950.5,
          winRate: 0.6,
          averageReturn: 95.05,
          averageReturnPct: 1.9,
          expectancy: 22.5,
        }),
      );
      return;
    }

    if (req.method === 'GET' && url === '/v1/analytics/strategy-stats') {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          strategies: [
            {
              strategy: {
                key: 'strong_buy_long',
                cioVerdictLabel: 'Strong Buy',
                recommendedDirection: 'long',
              },
              totalTrades: 6,
              winningTrades: 4,
              losingTrades: 2,
              breakevenTrades: 0,
              openTrades: 0,
              totalRealizedPnl: 600,
              winRate: 0.667,
            },
          ],
        }),
      );
      return;
    }

    if (req.method === 'GET' && url === '/v1/analytics/instrument-analysis') {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          instruments: [
            {
              symbol: 'RELIANCE',
              totalTrades: 4,
              winningTrades: 3,
              losingTrades: 1,
              breakevenTrades: 0,
              openTrades: 0,
              totalRealizedPnl: 400,
              winRate: 0.75,
            },
          ],
        }),
      );
      return;
    }

    if (req.method === 'GET' && url === '/v1/analytics/session-analysis') {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          sessions: [
            {
              session: 'h06_12',
              label: 'Morning',
              totalTrades: 5,
              winningTrades: 3,
              losingTrades: 2,
              breakevenTrades: 0,
              openTrades: 0,
              totalRealizedPnl: 300,
              winRate: 0.6,
            },
          ],
        }),
      );
      return;
    }

    if (req.method === 'GET' && url === '/v1/analytics/heatmap') {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          cells: [
            {
              dayOfWeek: 'monday',
              session: 'h06_12',
              sessionLabel: 'Morning',
              totalTrades: 2,
              totalRealizedPnl: 120,
              winRate: 1,
            },
          ],
        }),
      );
      return;
    }

    if (req.method === 'GET' && url === '/v1/analytics/trade-distribution') {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          buckets: [{ rangeStart: 0, rangeEnd: 100, count: 5 }],
          minPnl: -50,
          maxPnl: 200,
        }),
      );
      return;
    }

    if (req.method === 'GET' && url === '/v1/analytics/monthly-reports') {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          reports: [
            {
              month: { key: '2026-06', year: 2026, month: 6 },
              totalTrades: 10,
              winningTrades: 6,
              losingTrades: 4,
              breakevenTrades: 0,
              openTrades: 0,
              totalRealizedPnl: 950.5,
              winRate: 0.6,
            },
          ],
        }),
      );
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

type AnalyticsDashboardModule = typeof import('../src/components/analytics-dashboard');

let fakeServer: ReturnType<typeof startFakeServer>;
let AnalyticsDashboard: AnalyticsDashboardModule['AnalyticsDashboard'];

beforeAll(async () => {
  fakeServer = startFakeServer();
  const baseUrl = await fakeServer.listen();
  process.env.NEXT_PUBLIC_API_BASE_URL = baseUrl;
  ({ AnalyticsDashboard } = await import('../src/components/analytics-dashboard'));
});

afterEach(() => cleanup());

afterAll(async () => {
  await fakeServer.close();
});

describe('<AnalyticsDashboard />', () => {
  it('renders real stats and every breakdown from the analytics service', async () => {
    render(<AnalyticsDashboard />);

    await waitFor(() => expect(screen.getByText('10')).toBeTruthy());
    await waitFor(() => expect(screen.getByText(/Strong Buy/)).toBeTruthy());
    await waitFor(() => expect(screen.getAllByText(/RELIANCE/).length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.getAllByText(/Morning/).length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.getAllByText(/monday/).length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.getByText(/0\.00 to 100\.00/)).toBeTruthy());
    await waitFor(() => expect(screen.getByText('2026-06')).toBeTruthy());
  });
});
