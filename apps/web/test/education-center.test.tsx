import { createServer, type Server, type IncomingMessage } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

// Task 10.5: proves EducationCenter genuinely round-trips GET
// /v1/education/{categories,courses,glossary,strategies,quizzes,attempts,
// progress}, GET /v1/education/courses/{slug}/lessons, GET
// /v1/education/quizzes/{slug}/questions, POST
// /v1/education/quizzes/{slug}/attempts, and PUT
// /v1/education/progress/{contentType}/{contentId} through the real
// SDK/HTTP transport against a real bound stand-in server -- same
// real-bound-socket philosophy as research-lookup.test.tsx and the 10.4
// dashboard tests. Also proves listLessons()/listGlossaryTerms()/
// listStrategies() are read directly for "detail" views rather than
// triggering a second per-item network call (server would 404 on any
// get-single route since none is implemented below).

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
  const server: Server = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const fullUrl = new URL(req.url ?? '', 'http://127.0.0.1');
    const pathname = fullUrl.pathname;

    if (req.method === 'GET' && pathname === '/v1/education/categories') {
      res.statusCode = 200;
      res.end(
        JSON.stringify([
          { id: 'cat-1', slug: 'options', name: 'Options', createdAt: '2026-01-01T00:00:00Z' },
        ]),
      );
      return;
    }

    if (req.method === 'GET' && pathname === '/v1/education/courses') {
      res.statusCode = 200;
      res.end(
        JSON.stringify([
          {
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
          },
        ]),
      );
      return;
    }

    if (req.method === 'GET' && pathname === '/v1/education/courses/options-101/lessons') {
      res.statusCode = 200;
      res.end(
        JSON.stringify([
          {
            id: 'lesson-1',
            courseId: 'course-1',
            slug: 'what-is-a-call',
            title: 'What is a Call?',
            content: 'A call option gives the holder the right to buy.',
            orderIndex: 1,
            status: 'published',
            sourceType: 'human',
            version: 1,
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        ]),
      );
      return;
    }

    if (req.method === 'GET' && pathname === '/v1/education/glossary') {
      const search = fullUrl.searchParams.get('search');
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
      res.end(JSON.stringify(!search || 'delta'.includes(search.toLowerCase()) ? [term] : []));
      return;
    }

    if (req.method === 'GET' && pathname === '/v1/education/strategies') {
      res.statusCode = 200;
      res.end(
        JSON.stringify([
          {
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
          },
        ]),
      );
      return;
    }

    if (req.method === 'GET' && pathname === '/v1/education/quizzes') {
      res.statusCode = 200;
      res.end(
        JSON.stringify([
          {
            id: 'quiz-1',
            slug: 'options-basics',
            title: 'Options Basics Quiz',
            status: 'published',
            sourceType: 'human',
            version: 1,
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        ]),
      );
      return;
    }

    if (req.method === 'GET' && pathname === '/v1/education/quizzes/options-basics/questions') {
      res.statusCode = 200;
      res.end(
        JSON.stringify([
          {
            id: 'q1',
            quizId: 'quiz-1',
            question: 'What does a call option give the holder?',
            options: [
              'The right to buy',
              'The right to sell',
              'An obligation to buy',
              'An obligation to sell',
            ],
            orderIndex: 1,
          },
        ]),
      );
      return;
    }

    if (req.method === 'POST' && pathname === '/v1/education/quizzes/options-basics/attempts') {
      readBody(req).then((body) => {
        const submitted = body as {
          answers: { questionId: string; selectedOptionIndex: number }[];
        };
        const selected = submitted.answers[0]?.selectedOptionIndex;
        res.statusCode = 200;
        res.end(
          JSON.stringify({
            id: 'attempt-1',
            userId: 'user-1',
            quizId: 'quiz-1',
            score: selected === 0 ? 1 : 0,
            totalQuestions: 1,
            answers: [{ questionId: 'q1', selectedOptionIndex: selected, correct: selected === 0 }],
            completedAt: '2026-01-02T00:00:00Z',
          }),
        );
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/v1/education/attempts') {
      res.statusCode = 200;
      res.end(JSON.stringify([]));
      return;
    }

    if (req.method === 'GET' && pathname === '/v1/education/progress') {
      res.statusCode = 200;
      res.end(JSON.stringify([]));
      return;
    }

    if (req.method === 'PUT' && pathname.startsWith('/v1/education/progress/')) {
      const [, , , , contentType, contentId] = pathname.split('/');
      readBody(req).then((body) => {
        const input = body as { status: string; progressPct?: number };
        res.statusCode = 200;
        res.end(
          JSON.stringify({
            id: `prog-${contentType}-${contentId}`,
            userId: 'user-1',
            contentType,
            contentId,
            status: input.status,
            progressPct: input.progressPct ?? 0,
            lastAccessedAt: '2026-01-02T00:00:00Z',
            createdAt: '2026-01-01T00:00:00Z',
          }),
        );
      });
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: `not found: ${req.method} ${pathname}` }));
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

type EducationCenterModule = typeof import('../src/components/education-center');

let fakeServer: ReturnType<typeof startFakeServer>;
let EducationCenter: EducationCenterModule['EducationCenter'];

beforeAll(async () => {
  fakeServer = startFakeServer();
  const baseUrl = await fakeServer.listen();
  process.env.NEXT_PUBLIC_API_BASE_URL = baseUrl;
  ({ EducationCenter } = await import('../src/components/education-center'));
});

afterEach(() => cleanup());

afterAll(async () => {
  await fakeServer.close();
});

describe('<EducationCenter />', () => {
  it('browses real courses and lessons, and marks real progress', async () => {
    render(<EducationCenter />);

    await waitFor(() => expect(screen.getByText('Options 101')).toBeTruthy());
    fireEvent.click(screen.getByText('Options 101'));

    await waitFor(() => expect(screen.getByText('What is a Call?')).toBeTruthy());
    fireEvent.click(screen.getByText('What is a Call?'));

    await waitFor(() =>
      expect(screen.getByText(/A call option gives the holder the right to buy\./)).toBeTruthy(),
    );

    const markCompleteButtons = screen.getAllByText('Mark complete');
    fireEvent.click(markCompleteButtons[0]);

    await waitFor(() =>
      expect(screen.getAllByText(/Your progress: completed/).length).toBeGreaterThan(0),
    );
  });

  it('searches real glossary terms and shows the real definition', async () => {
    render(<EducationCenter />);
    fireEvent.click(screen.getByRole('tab', { name: 'Glossary' }));

    await waitFor(() => expect(screen.getByText('Delta')).toBeTruthy());
    fireEvent.click(screen.getByText('Delta'));

    await waitFor(() =>
      expect(screen.getByText(/The rate of change of an option price/)).toBeTruthy(),
    );
  });

  it('browses real strategies', async () => {
    render(<EducationCenter />);
    fireEvent.click(screen.getByRole('tab', { name: 'Strategies' }));

    await waitFor(() => expect(screen.getByText('Iron Condor')).toBeTruthy());
    fireEvent.click(screen.getByText('Iron Condor'));

    await waitFor(() => expect(screen.getByText(/Sell OTM call and put spreads/)).toBeTruthy());
  });

  it('takes a real quiz, submits real answers, and shows the real scored result', async () => {
    render(<EducationCenter />);
    fireEvent.click(screen.getByRole('tab', { name: 'Quizzes' }));

    await waitFor(() => expect(screen.getByText('Options Basics Quiz')).toBeTruthy());
    fireEvent.click(screen.getByText('Options Basics Quiz'));

    await waitFor(() =>
      expect(screen.getByText(/What does a call option give the holder\?/)).toBeTruthy(),
    );
    fireEvent.click(screen.getByLabelText('The right to buy'));
    fireEvent.click(screen.getByText('Submit answers'));

    await waitFor(() => expect(screen.getByText('Score: 1 / 1')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('Question 1: Correct')).toBeTruthy());
  });
});
