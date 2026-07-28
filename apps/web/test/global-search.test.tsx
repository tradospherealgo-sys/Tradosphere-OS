import { createServer, type Server, type IncomingMessage } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

// Task 10.6: proves GlobalSearch genuinely round-trips the real `?search=`
// query param on GET /v1/education/{courses,glossary,strategies} through the
// real SDK/HTTP transport against a real bound stand-in server -- same
// real-bound-socket philosophy as education-center.test.tsx, applied to the
// federated single-input search screen. Also proves an empty-results term
// renders "No matches." per-section rather than fabricating a result.

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : undefined);
      } catch (err) {
        reject(err);
      }
    });
  });
}

function startFakeServer() {
  const requestedSearchTerms: string[] = [];

  const server: Server = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const fullUrl = new URL(req.url ?? '', 'http://127.0.0.1');
    const pathname = fullUrl.pathname;
    const search = fullUrl.searchParams.get('search') ?? '';

    if (req.method === 'GET' && pathname === '/v1/education/courses') {
      requestedSearchTerms.push(`courses:${search}`);
      const course = {
        id: 'course-1',
        slug: 'options-101',
        title: 'Options 101',
        description: 'Intro to options trading.',
        categoryId: 'cat-1',
        difficulty: 'beginner',
        status: 'published',
        sourceType: 'human',
        version: 1,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };
      res.statusCode = 200;
      res.end(JSON.stringify(search.toLowerCase() === 'nomatch' ? [] : [course]));
      return;
    }

    if (req.method === 'GET' && pathname === '/v1/education/glossary') {
      requestedSearchTerms.push(`glossary:${search}`);
      const term = {
        id: 'term-1',
        slug: 'delta',
        term: 'Delta',
        definition: 'The rate of change of an option price relative to the underlying.',
        status: 'published',
        sourceType: 'human',
        version: 1,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };
      res.statusCode = 200;
      res.end(JSON.stringify(search.toLowerCase() === 'nomatch' ? [] : [term]));
      return;
    }

    if (req.method === 'GET' && pathname === '/v1/education/strategies') {
      requestedSearchTerms.push(`strategies:${search}`);
      const strategy = {
        id: 'strat-1',
        slug: 'iron-condor',
        name: 'Iron Condor',
        description: 'Sell OTM call and put spreads for defined risk.',
        categoryId: 'cat-1',
        difficulty: 'advanced',
        status: 'published',
        sourceType: 'human',
        version: 1,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };
      res.statusCode = 200;
      res.end(JSON.stringify(search.toLowerCase() === 'nomatch' ? [] : [strategy]));
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
      return new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
    requestedSearchTerms,
  };
}

type GlobalSearchModule = typeof import('../src/components/global-search');

let fakeServer: ReturnType<typeof startFakeServer>;
let GlobalSearch: GlobalSearchModule['GlobalSearch'];

beforeAll(async () => {
  fakeServer = startFakeServer();
  const baseUrl = await fakeServer.listen();
  process.env.NEXT_PUBLIC_API_BASE_URL = baseUrl;
  ({ GlobalSearch } = await import('../src/components/global-search'));
});

afterAll(async () => {
  await fakeServer.close();
});

afterEach(() => cleanup());

function submitSearch(term: string) {
  fireEvent.change(screen.getByLabelText('Search courses, glossary, and strategies'), {
    target: { value: term },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
}

describe('GlobalSearch', () => {
  it('shows idle prompts in every section before a search is run', () => {
    render(<GlobalSearch />);
    expect(screen.getAllByText('Enter a search term above.')).toHaveLength(3);
  });

  it('federates a real search across courses, glossary, and strategies', async () => {
    render(<GlobalSearch />);

    submitSearch('delta');

    await waitFor(() => expect(screen.getByText('Options 101')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('Delta')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('Iron Condor')).toBeTruthy());

    expect(fakeServer.requestedSearchTerms).toContain('courses:delta');
    expect(fakeServer.requestedSearchTerms).toContain('glossary:delta');
    expect(fakeServer.requestedSearchTerms).toContain('strategies:delta');
  });

  it('renders "No matches." per section on a real empty-result response, never fabricated data', async () => {
    render(<GlobalSearch />);

    submitSearch('nomatch');

    await waitFor(() => expect(screen.getAllByText('No matches.')).toHaveLength(3));
  });

  it('excludes quizzes and lessons from the search surface, per the deferred-capability note', () => {
    render(<GlobalSearch />);
    expect(screen.getByText(/Quizzes and individual lessons aren't searchable yet\./)).toBeTruthy();
  });
});
