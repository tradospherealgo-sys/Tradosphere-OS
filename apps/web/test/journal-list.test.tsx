import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

// Task 10.4: proves JournalList genuinely round-trips GET /v1/journal/entries
// and POST /v1/journal/entries/{id}/outcome through the real SDK/HTTP
// transport against a real bound stand-in server -- same real-bound-socket
// philosophy as research-lookup.test.tsx and order-form.test.tsx. Outcome
// recording is write-once server-side (Decision D16): a second call on an
// already-closed entry must surface the real 409 as an error, never silently
// overwrite the first outcome.

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

function startFakeServer() {
  // entry-open starts open; recording an outcome on it flips it closed --
  // a second recordOutcome call on the same id then gets a real 409.
  let openEntryStatus: 'open' | 'closed' = 'open';

  const server: Server = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const url = req.url ?? '';

    if (req.method === 'GET' && url === '/v1/journal/entries') {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          entries: [
            {
              id: 'entry-open',
              symbol: 'RELIANCE',
              side: 'buy',
              quantity: 1,
              fillPrice: 2456.75,
              filledAtIso: new Date().toISOString(),
              priceAsOfIso: new Date().toISOString(),
              status: openEntryStatus,
              createdAtIso: new Date().toISOString(),
              ...(openEntryStatus === 'closed'
                ? { exitPrice: 2500, exitAtIso: new Date().toISOString(), realizedPnl: 43.25 }
                : {}),
            },
            {
              id: 'entry-closed',
              symbol: 'TCS',
              side: 'sell',
              quantity: 3,
              fillPrice: 3800,
              filledAtIso: new Date().toISOString(),
              priceAsOfIso: new Date().toISOString(),
              status: 'closed',
              exitPrice: 3750,
              exitAtIso: new Date().toISOString(),
              realizedPnl: 150,
              createdAtIso: new Date().toISOString(),
            },
          ],
        }),
      );
      return;
    }

    if (req.method === 'POST' && url === '/v1/journal/entries/entry-open/outcome') {
      readBody(req).then(() => {
        if (openEntryStatus === 'closed') {
          res.statusCode = 409;
          res.end(JSON.stringify({ error: 'entry already closed' }));
          return;
        }
        openEntryStatus = 'closed';
        res.statusCode = 200;
        res.end(
          JSON.stringify({
            id: 'entry-open',
            symbol: 'RELIANCE',
            side: 'buy',
            quantity: 1,
            fillPrice: 2456.75,
            filledAtIso: new Date().toISOString(),
            priceAsOfIso: new Date().toISOString(),
            status: 'closed',
            exitPrice: 2500,
            exitAtIso: new Date().toISOString(),
            realizedPnl: 43.25,
            createdAtIso: new Date().toISOString(),
          }),
        );
      });
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

type JournalListModule = typeof import('../src/components/journal-list');

let fakeServer: ReturnType<typeof startFakeServer>;
let JournalList: JournalListModule['JournalList'];

beforeAll(async () => {
  fakeServer = startFakeServer();
  const baseUrl = await fakeServer.listen();
  process.env.NEXT_PUBLIC_API_BASE_URL = baseUrl;
  ({ JournalList } = await import('../src/components/journal-list'));
});

afterEach(() => cleanup());

afterAll(async () => {
  await fakeServer.close();
});

describe('<JournalList />', () => {
  it('renders the real entries from the journal service', async () => {
    render(<JournalList />);

    await waitFor(() => expect(screen.getByText(/RELIANCE/)).toBeTruthy());
    expect(screen.getByText(/TCS/)).toBeTruthy();
    expect(screen.getByText(/150\.00/)).toBeTruthy();
  });

  it('records a real outcome on an open entry and reloads it as closed', async () => {
    render(<JournalList />);

    await waitFor(() => expect(screen.getByText(/RELIANCE/)).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /record outcome/i }));

    const exitPriceInput = screen.getByLabelText('Exit price');
    fireEvent.change(exitPriceInput, { target: { value: '2500' } });

    fireEvent.click(screen.getByRole('button', { name: /submit outcome/i }));

    await waitFor(() => expect(screen.getByText(/43\.25/)).toBeTruthy());
  });
});
