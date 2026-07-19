import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeEach } from 'vitest';
import { submitQuizAttempt } from '../src/quiz-scoring';
import { InMemoryQuizQuestionRepository, InMemoryQuizAttemptRepository } from './fakes';
import { NotFoundError, AnswerCountMismatchError } from '../src/errors';

// Unit tests for submitQuizAttempt() against the QuizScoringDeps port
// directly (InMemoryQuizQuestionRepository + InMemoryQuizAttemptRepository),
// not through HTTP -- app.test.ts's "quiz attempts" describe block already
// covers the HTTP-level happy path plus the 400 mismatch response; this file
// is the exhaustive scoring-logic suite Forge's charter rule 3 requires for
// quiz-scoring.ts itself. See quiz-scoring.ts's header comment for why
// scoring lives outside repository.ts, and its rule-2 comment for why every
// rejection below must happen before any row is written to quizAttemptRepo.

describe('submitQuizAttempt', () => {
  let quizQuestionRepo: InMemoryQuizQuestionRepository;
  let quizAttemptRepo: InMemoryQuizAttemptRepository;
  let quizId: string;
  let questionA: Awaited<ReturnType<InMemoryQuizQuestionRepository['create']>>;
  let questionB: Awaited<ReturnType<InMemoryQuizQuestionRepository['create']>>;

  beforeEach(async () => {
    quizQuestionRepo = new InMemoryQuizQuestionRepository();
    quizAttemptRepo = new InMemoryQuizAttemptRepository();
    quizId = randomUUID();
    questionA = await quizQuestionRepo.create({
      quizId,
      question: 'What does "long" mean?',
      options: ['Buy expecting price to rise', 'Sell expecting price to fall', 'Hold cash', 'Short the market'],
      correctOptionIndex: 0,
      orderIndex: 0,
    });
    questionB = await quizQuestionRepo.create({
      quizId,
      question: 'What is a stop-loss order?',
      options: [
        'An order that guarantees profit',
        'An order that limits downside risk',
        'A tax form',
        'A dividend type',
      ],
      correctOptionIndex: 1,
      orderIndex: 1,
    });
  });

  it('scores a fully correct submission', async () => {
    const attempt = await submitQuizAttempt(
      { quizQuestionRepo, quizAttemptRepo },
      {
        userId: 'trader-1',
        quizId,
        answers: [
          { questionId: questionA.id, selectedOptionIndex: 0 },
          { questionId: questionB.id, selectedOptionIndex: 1 },
        ],
      },
    );

    expect(attempt.score).toBe(2);
    expect(attempt.totalQuestions).toBe(2);
    expect(attempt.userId).toBe('trader-1');
    expect(attempt.quizId).toBe(quizId);
    expect(attempt.answers).toEqual([
      { questionId: questionA.id, selectedOptionIndex: 0, correct: true },
      { questionId: questionB.id, selectedOptionIndex: 1, correct: true },
    ]);
  });

  it('scores a fully incorrect submission', async () => {
    const attempt = await submitQuizAttempt(
      { quizQuestionRepo, quizAttemptRepo },
      {
        userId: 'trader-1',
        quizId,
        answers: [
          { questionId: questionA.id, selectedOptionIndex: 1 },
          { questionId: questionB.id, selectedOptionIndex: 0 },
        ],
      },
    );

    expect(attempt.score).toBe(0);
    expect(attempt.answers.every((a) => a.correct === false)).toBe(true);
  });

  it('scores a partially correct submission', async () => {
    const attempt = await submitQuizAttempt(
      { quizQuestionRepo, quizAttemptRepo },
      {
        userId: 'trader-1',
        quizId,
        answers: [
          { questionId: questionA.id, selectedOptionIndex: 0 }, // correct
          { questionId: questionB.id, selectedOptionIndex: 0 }, // incorrect
        ],
      },
    );

    expect(attempt.score).toBe(1);
    expect(attempt.answers).toEqual([
      { questionId: questionA.id, selectedOptionIndex: 0, correct: true },
      { questionId: questionB.id, selectedOptionIndex: 0, correct: false },
    ]);
  });

  it('scores by question id, not by answers-array position', async () => {
    // Submitted in the reverse of listByQuiz's orderIndex order -- the Map
    // lookup in quiz-scoring.ts must match each answer to its own question,
    // never compare positionally against the orderIndex-sorted question list.
    const attempt = await submitQuizAttempt(
      { quizQuestionRepo, quizAttemptRepo },
      {
        userId: 'trader-1',
        quizId,
        answers: [
          { questionId: questionB.id, selectedOptionIndex: 1 }, // correct, submitted first
          { questionId: questionA.id, selectedOptionIndex: 0 }, // correct, submitted second
        ],
      },
    );

    expect(attempt.score).toBe(2);
  });

  it('persists the attempt so it is retrievable via quizAttemptRepo.listForUser', async () => {
    await submitQuizAttempt(
      { quizQuestionRepo, quizAttemptRepo },
      {
        userId: 'trader-1',
        quizId,
        answers: [
          { questionId: questionA.id, selectedOptionIndex: 0 },
          { questionId: questionB.id, selectedOptionIndex: 1 },
        ],
      },
    );

    const attempts = await quizAttemptRepo.listForUser('trader-1', quizId);
    expect(attempts).toHaveLength(1);
    expect(attempts[0].score).toBe(2);
  });

  it('throws NotFoundError when the quiz has zero questions', async () => {
    const emptyQuizId = randomUUID();
    const promise = submitQuizAttempt(
      { quizQuestionRepo, quizAttemptRepo },
      { userId: 'trader-1', quizId: emptyQuizId, answers: [] },
    );

    await expect(promise).rejects.toThrow(NotFoundError);
    await expect(promise).rejects.toThrow(/^quiz not found:/);
  });

  it('throws AnswerCountMismatchError when too few answers are submitted', async () => {
    const promise = submitQuizAttempt(
      { quizQuestionRepo, quizAttemptRepo },
      { userId: 'trader-1', quizId, answers: [{ questionId: questionA.id, selectedOptionIndex: 0 }] },
    );

    await expect(promise).rejects.toThrow(AnswerCountMismatchError);
    await expect(promise).rejects.toThrow(/expected 2 answers, received 1/);
  });

  it('throws AnswerCountMismatchError when too many answers are submitted', async () => {
    const promise = submitQuizAttempt(
      { quizQuestionRepo, quizAttemptRepo },
      {
        userId: 'trader-1',
        quizId,
        answers: [
          { questionId: questionA.id, selectedOptionIndex: 0 },
          { questionId: questionB.id, selectedOptionIndex: 1 },
          { questionId: randomUUID(), selectedOptionIndex: 0 },
        ],
      },
    );

    await expect(promise).rejects.toThrow(AnswerCountMismatchError);
    await expect(promise).rejects.toThrow(/expected 2 answers, received 3/);
  });

  it('throws NotFoundError when an answer references a question outside this quiz', async () => {
    const otherQuestion = await quizQuestionRepo.create({
      quizId: randomUUID(),
      question: 'Unrelated question from a different quiz',
      options: ['A', 'B'],
      correctOptionIndex: 0,
      orderIndex: 0,
    });
    const promise = submitQuizAttempt(
      { quizQuestionRepo, quizAttemptRepo },
      {
        userId: 'trader-1',
        quizId,
        answers: [
          { questionId: questionA.id, selectedOptionIndex: 0 },
          { questionId: otherQuestion.id, selectedOptionIndex: 0 }, // belongs to a different quiz
        ],
      },
    );

    await expect(promise).rejects.toThrow(NotFoundError);
    await expect(promise).rejects.toThrow(/^quiz question \(in this quiz\) not found:/);
  });

  it('does not persist an attempt when the answer count mismatches', async () => {
    const promise = submitQuizAttempt(
      { quizQuestionRepo, quizAttemptRepo },
      { userId: 'trader-1', quizId, answers: [{ questionId: questionA.id, selectedOptionIndex: 0 }] },
    );
    await expect(promise).rejects.toThrow(AnswerCountMismatchError);

    const attempts = await quizAttemptRepo.listForUser('trader-1', quizId);
    expect(attempts).toHaveLength(0);
  });

  it('does not persist an attempt when an answer references a question outside this quiz', async () => {
    const otherQuestion = await quizQuestionRepo.create({
      quizId: randomUUID(),
      question: 'Unrelated question',
      options: ['A', 'B'],
      correctOptionIndex: 0,
      orderIndex: 0,
    });
    const promise = submitQuizAttempt(
      { quizQuestionRepo, quizAttemptRepo },
      {
        userId: 'trader-1',
        quizId,
        answers: [
          { questionId: questionA.id, selectedOptionIndex: 0 },
          { questionId: otherQuestion.id, selectedOptionIndex: 0 },
        ],
      },
    );
    await expect(promise).rejects.toThrow(NotFoundError);

    const attempts = await quizAttemptRepo.listForUser('trader-1', quizId);
    expect(attempts).toHaveLength(0);
  });
});
