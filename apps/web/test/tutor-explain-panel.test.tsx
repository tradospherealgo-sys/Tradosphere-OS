import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { CioVerdict } from '@tradosphere/sdk';

// Task 10.3: proves TutorExplainPanel genuinely round-trips POST
// /v1/education/tutor/explain through the real SDK/HTTP transport against a
// real bound stand-in server -- same real-bound-socket philosophy as
// research-lookup.test.tsx, applied to the tutor "explain this verdict"
// action instead of a GET lookup.

const verdict: CioVerdict = {
  verdict: 'moderately_bullish',
  confidence: 62,
  generatedAtIso: new Date().toISOString(),
  tradeIdeas: [],
  opinions: [
    {
      expert: 'technical',
      verdict: 'moderately_bullish',
      confidence: 58,
      reasoning: ['Price is above the 50-day moving average.'],
      generatedAtIso: new Date().toISOString(),
    },
    {
      expert: 'risk',
      verdict: 'neutral',
      confidence: 50,
      reasoning: ['Position sizing is within normal risk bounds.'],
      generatedAtIso: new Date().toISOString(),
    },
  ],
};

function startFakeTutorServer() {
  const server: Server = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const url = req.url ?? '';

    if (req.method === 'POST' && url === '/v1/education/tutor/explain') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        const parsed = JSON.parse(body || '{}');

        // A sentinel reasoning string is how this real bound server is
        // told to exercise its failure branch -- no mocking of the SDK
        // layer, just a different real HTTP response for a different
        // real request body.
        const shouldFail =
          !Array.isArray(parsed.opinions) ||
          parsed.opinions.length === 0 ||
          parsed.opinions.some((o: { reasoning?: string[] }) =>
            o.reasoning?.includes('TRIGGER_SERVER_ERROR'),
          );

        if (shouldFail) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'internal error' }));
          return;
        }

        res.statusCode = 200;
        res.end(
          JSON.stringify({
            expert: 'education',
            verdict: 'moderately_bullish',
            confidence: 60,
            reasoning: [
              'The technical expert sees upward momentum above the 50-day average.',
              'Risk sizing stays inside normal bounds, so this is a moderate call, not a strong one.',
            ],
            generatedAtIso: new Date().toISOString(),
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

type TutorExplainPanelModule = typeof import('../src/components/tutor-explain-panel');

let fakeServer: ReturnType<typeof startFakeTutorServer>;
let TutorExplainPanel: TutorExplainPanelModule['TutorExplainPanel'];

beforeAll(async () => {
  fakeServer = startFakeTutorServer();
  const baseUrl = await fakeServer.listen();
  process.env.NEXT_PUBLIC_API_BASE_URL = baseUrl;
  ({ TutorExplainPanel } = await import('../src/components/tutor-explain-panel'));
});

afterEach(() => cleanup());

afterAll(async () => {
  await fakeServer.close();
});

describe('<TutorExplainPanel />', () => {
  it('renders "no verdict yet" state when nothing has arrived', () => {
    render(<TutorExplainPanel verdict={null} />);
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.getByRole('button', { name: /explain this verdict/i })).toHaveProperty(
      'disabled',
      true,
    );
  });

  it('renders the real tutor explanation returned by the gateway', async () => {
    render(<TutorExplainPanel verdict={verdict} />);

    fireEvent.click(screen.getByRole('button', { name: /explain this verdict/i }));

    await waitFor(() =>
      expect(screen.getByText(/upward momentum above the 50-day average/i)).toBeTruthy(),
    );
    expect(screen.getByText(/moderate call, not a strong one/i)).toBeTruthy();
  });

  it('renders an explicit error state on a real server failure, never fabricated data', async () => {
    const brokenVerdict: CioVerdict = {
      ...verdict,
      opinions: [{ ...verdict.opinions[0], reasoning: ['TRIGGER_SERVER_ERROR'] }],
    };

    render(<TutorExplainPanel verdict={brokenVerdict} />);
    fireEvent.click(screen.getByRole('button', { name: /explain this verdict/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  });
});
