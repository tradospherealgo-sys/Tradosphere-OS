import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

// Task 10.4: proves OrderForm genuinely round-trips POST
// /v1/paper-trading/orders and, on the follow-up "Save to journal" action,
// POST /v1/journal/entries, through the real SDK/HTTP transport against a
// real bound stand-in server -- same real-bound-socket philosophy as
// research-lookup.test.tsx, applied here to the paper-trading + journal
// domains. A symbol with no live tick on record gets a real server error,
// never a guessed fill price (Decision D14).

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
  const server: Server = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const url = req.url ?? '';

    if (req.method === 'POST' && url === '/v1/paper-trading/orders') {
      readBody(req).then((body) => {
        const { symbol, side, quantity } = body as {
          symbol: string;
          side: string;
          quantity: number;
        };
        if (symbol === 'UNKNOWN') {
          res.statusCode = 422;
          res.end(JSON.stringify({ error: 'no recent market tick on record for UNKNOWN' }));
          return;
        }
        res.statusCode = 200;
        res.end(
          JSON.stringify({
            symbol,
            side,
            quantity,
            price: 2456.75,
            priceAsOfIso: new Date().toISOString(),
            filledAtIso: new Date().toISOString(),
          }),
        );
      });
      return;
    }

    if (req.method === 'POST' && url === '/v1/journal/entries') {
      readBody(req).then((body) => {
        const { fill } = body as { fill: { symbol: string } };
        if (fill.symbol === 'BOOMJOURNAL') {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'internal error' }));
          return;
        }
        res.statusCode = 201;
        res.end(
          JSON.stringify({
            id: 'journal-entry-1',
            symbol: fill.symbol,
            side: 'buy',
            quantity: 1,
            fillPrice: 2456.75,
            filledAtIso: new Date().toISOString(),
            priceAsOfIso: new Date().toISOString(),
            status: 'open',
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

type OrderFormModule = typeof import('../src/components/order-form');

let fakeServer: ReturnType<typeof startFakeServer>;
let OrderForm: OrderFormModule['OrderForm'];

beforeAll(async () => {
  fakeServer = startFakeServer();
  const baseUrl = await fakeServer.listen();
  process.env.NEXT_PUBLIC_API_BASE_URL = baseUrl;
  ({ OrderForm } = await import('../src/components/order-form'));
});

afterEach(() => cleanup());

afterAll(async () => {
  await fakeServer.close();
});

describe('<OrderForm />', () => {
  it('places a real order and then saves the real fill to the journal', async () => {
    render(<OrderForm />);

    fireEvent.change(screen.getByLabelText('Symbol'), { target: { value: 'reliance' } });
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /place order/i }));

    await waitFor(() => expect(screen.getByText(/2456\.75/)).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /save to journal/i }));

    await waitFor(() => expect(screen.getByText(/saved to journal/i)).toBeTruthy());
    expect(screen.getByText(/journal-entry-1/)).toBeTruthy();
  });

  it('renders a real error state when the symbol has no tick on record, never a guessed price', async () => {
    render(<OrderForm />);

    fireEvent.change(screen.getByLabelText('Symbol'), { target: { value: 'unknown' } });
    fireEvent.click(screen.getByRole('button', { name: /place order/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  });

  it('renders a real error state when saving to the journal fails', async () => {
    render(<OrderForm />);

    fireEvent.change(screen.getByLabelText('Symbol'), { target: { value: 'boomjournal' } });
    fireEvent.click(screen.getByRole('button', { name: /place order/i }));

    await waitFor(() => expect(screen.getByText(/boomjournal/i)).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /save to journal/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  });
});
