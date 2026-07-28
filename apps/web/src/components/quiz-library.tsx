'use client';

// Task 10.5: Quizzes -- the one interactive (write) surface in the
// Education Center, per Anshh's 10.5 sign-off: "implement the complete quiz
// experience rather than a browse-only interface." listPublicQuizQuestions()
// returns the redacted question set (no correctOptionIndex/explanation --
// that's the admin-only answer-key route, never called here). Submitting
// calls the real POST .../attempts endpoint; the returned QuizAttempt
// already carries each answer's real `correct` flag and the real score, so
// per-question correctness is read straight from that response rather than
// re-deriving it client-side (which would require the answer key this
// screen intentionally never fetches). listMyQuizAttempts() is called once
// and filtered client-side per quiz, avoiding a separate
// listQuizAttemptsForQuiz() round trip per quiz selected.
import { useEffect, useState } from 'react';
import { SdkHttpError } from '@tradosphere/sdk';
import type { Progress, PublicQuizQuestion, Quiz, QuizAttempt } from '@tradosphere/sdk';
import { sdk } from '@/lib/sdk';
import { ProgressControl } from './progress-control';

type SectionState<T> =
  { phase: 'loading' } | { phase: 'loaded'; data: T } | { phase: 'error'; message: string };

type SubmitState =
  | { phase: 'idle' }
  | { phase: 'submitting' }
  | { phase: 'submitted'; attempt: QuizAttempt }
  | { phase: 'error'; message: string };

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof SdkHttpError ? err.message : fallback;
}

export function QuizLibrary({
  progressFor,
  onMarkProgress,
}: {
  progressFor: (contentType: 'quiz', contentId: string) => Progress | undefined;
  onMarkProgress: (contentType: 'quiz', contentId: string, status: Progress['status']) => void;
}) {
  const [quizzes, setQuizzes] = useState<SectionState<Quiz[]>>({ phase: 'loading' });
  const [attempts, setAttempts] = useState<SectionState<QuizAttempt[]>>({ phase: 'loading' });
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [questions, setQuestions] = useState<SectionState<PublicQuizQuestion[]>>({
    phase: 'loading',
  });
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submit, setSubmit] = useState<SubmitState>({ phase: 'idle' });

  useEffect(() => {
    sdk.education
      .listQuizzes()
      .then((data) => setQuizzes({ phase: 'loaded', data }))
      .catch((err) =>
        setQuizzes({
          phase: 'error',
          message: errorMessage(err, 'Could not reach the education service.'),
        }),
      );

    sdk.education
      .listMyQuizAttempts()
      .then((data) => setAttempts({ phase: 'loaded', data }))
      .catch((err) =>
        setAttempts({
          phase: 'error',
          message: errorMessage(err, 'Could not reach the education service.'),
        }),
      );
  }, []);

  function selectQuiz(slug: string) {
    setSelectedSlug(slug);
    setAnswers({});
    setSubmit({ phase: 'idle' });
    setQuestions({ phase: 'loading' });
    sdk.education
      .listPublicQuizQuestions(slug)
      .then((data) => setQuestions({ phase: 'loaded', data }))
      .catch((err) =>
        setQuestions({
          phase: 'error',
          message: errorMessage(err, 'Could not reach the education service.'),
        }),
      );
  }

  const selectedQuiz =
    quizzes.phase === 'loaded' ? quizzes.data.find((q) => q.slug === selectedSlug) : undefined;
  const quizAttempts =
    attempts.phase === 'loaded' && selectedQuiz
      ? attempts.data.filter((a) => a.quizId === selectedQuiz.id)
      : [];

  async function handleSubmit() {
    if (!selectedQuiz || questions.phase !== 'loaded') return;
    const answerList = questions.data.map((q) => ({
      questionId: q.id,
      selectedOptionIndex: answers[q.id] ?? -1,
    }));
    if (answerList.some((a) => a.selectedOptionIndex < 0)) return;

    setSubmit({ phase: 'submitting' });
    try {
      const attempt = await sdk.education.submitQuizAttempt(selectedQuiz.slug, {
        answers: answerList,
      });
      setSubmit({ phase: 'submitted', attempt });
      setAttempts((prev) =>
        prev.phase === 'loaded' ? { phase: 'loaded', data: [...prev.data, attempt] } : prev,
      );
      onMarkProgress('quiz', selectedQuiz.id, 'completed');
    } catch (err) {
      setSubmit({
        phase: 'error',
        message: errorMessage(err, 'Could not submit the quiz attempt.'),
      });
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <section
        className="rounded-lg border border-border bg-surface p-4"
        aria-labelledby="quizzes-heading"
      >
        <h2 id="quizzes-heading" className="text-sm font-medium">
          Quizzes
        </h2>

        {quizzes.phase === 'loading' && (
          <p className="mt-3 text-sm text-muted" role="status">
            Loading…
          </p>
        )}
        {quizzes.phase === 'error' && (
          <p className="mt-3 text-sm text-danger" role="alert">
            {quizzes.message}
          </p>
        )}
        {quizzes.phase === 'loaded' && quizzes.data.length === 0 && (
          <p className="mt-3 text-sm text-muted" role="status">
            No quizzes published yet.
          </p>
        )}
        {quizzes.phase === 'loaded' && quizzes.data.length > 0 && (
          <ul className="mt-3 space-y-1" role="list">
            {quizzes.data.map((quiz) => {
              const progress = progressFor('quiz', quiz.id);
              const best =
                attempts.phase === 'loaded'
                  ? attempts.data
                      .filter((a) => a.quizId === quiz.id)
                      .reduce<number | null>(
                        (max, a) => (max === null || a.score > max ? a.score : max),
                        null,
                      )
                  : null;
              return (
                <li key={quiz.id}>
                  <button
                    type="button"
                    onClick={() => selectQuiz(quiz.slug)}
                    className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
                      selectedSlug === quiz.slug ? 'border-accent bg-bg' : 'border-border'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{quiz.title}</span>
                      {progress && <span className="text-xs text-muted">{progress.status}</span>}
                    </div>
                    {best !== null && (
                      <span className="text-xs text-muted">Best score: {best}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section
        className="rounded-lg border border-border bg-surface p-4"
        aria-labelledby="quiz-detail-heading"
      >
        <h2 id="quiz-detail-heading" className="text-sm font-medium">
          Take quiz
        </h2>

        {!selectedQuiz && (
          <p className="mt-3 text-sm text-muted" role="status">
            Select a quiz to answer its questions.
          </p>
        )}

        {selectedQuiz && (
          <>
            {quizAttempts.length > 0 && (
              <p className="mt-2 text-xs text-muted" role="status">
                Previous attempts:{' '}
                {quizAttempts.map((a) => `${a.score}/${a.totalQuestions}`).join(', ')}
              </p>
            )}

            {questions.phase === 'loading' && (
              <p className="mt-3 text-sm text-muted" role="status">
                Loading…
              </p>
            )}
            {questions.phase === 'error' && (
              <p className="mt-3 text-sm text-danger" role="alert">
                {questions.message}
              </p>
            )}
            {questions.phase === 'loaded' && questions.data.length === 0 && (
              <p className="mt-3 text-sm text-muted" role="status">
                This quiz has no questions yet.
              </p>
            )}

            {questions.phase === 'loaded' &&
              questions.data.length > 0 &&
              submit.phase !== 'submitted' && (
                <div className="mt-3 space-y-3">
                  {questions.data.map((q, idx) => (
                    <fieldset key={q.id} className="rounded-md border border-border p-2">
                      <legend className="px-1 text-xs font-medium">
                        {idx + 1}. {q.question}
                      </legend>
                      <div className="mt-1 space-y-1">
                        {q.options.map((option, optionIdx) => (
                          <label key={optionIdx} className="flex items-center gap-2 text-xs">
                            <input
                              type="radio"
                              name={`question-${q.id}`}
                              checked={answers[q.id] === optionIdx}
                              onChange={() =>
                                setAnswers((prev) => ({ ...prev, [q.id]: optionIdx }))
                              }
                            />
                            {option}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  ))}

                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={
                      submit.phase === 'submitting' ||
                      questions.data.some((q) => answers[q.id] === undefined)
                    }
                    className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-bg disabled:opacity-50"
                  >
                    {submit.phase === 'submitting' ? 'Submitting…' : 'Submit answers'}
                  </button>
                  {submit.phase === 'error' && (
                    <p className="text-sm text-danger" role="alert">
                      {submit.message}
                    </p>
                  )}
                </div>
              )}

            {submit.phase === 'submitted' && (
              <div className="mt-3 rounded-md border border-border p-3">
                <p className="text-sm font-semibold">
                  Score: {submit.attempt.score} / {submit.attempt.totalQuestions}
                </p>
                <ul className="mt-2 space-y-1" role="list">
                  {submit.attempt.answers.map((a, idx) => (
                    <li
                      key={a.questionId}
                      className={`text-xs ${a.correct ? 'text-success' : 'text-danger'}`}
                    >
                      Question {idx + 1}: {a.correct ? 'Correct' : 'Incorrect'}
                    </li>
                  ))}
                </ul>
                <ProgressControl
                  progress={progressFor('quiz', selectedQuiz.id)}
                  onMark={(status) => onMarkProgress('quiz', selectedQuiz.id, status)}
                />
                <button
                  type="button"
                  onClick={() => selectQuiz(selectedQuiz.slug)}
                  className="mt-2 rounded-md border border-border px-2 py-1 text-xs font-medium"
                >
                  Retake quiz
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
