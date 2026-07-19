import type { QuizAttempt } from '@tradosphere/database';
import type { QuizQuestionRepository, QuizAttemptRepository } from './repository';
import { AnswerCountMismatchError, NotFoundError } from './errors';

// Scoring spans two repositories (quiz_questions to know what's correct,
// quiz_attempts to persist the result), so it can't live inside either
// Drizzle*Repository in repository.ts -- same reason services/auth keeps
// auth-logic.ts separate from repository.ts's UserRepository/SessionRepository.
// This is also where Forge's charter rule 2 (no silent fallback) applies to a
// non-broker call: a wrong or partial score written to quiz_attempts is a
// fabricated result, not a UI nicety, so every rejection below happens before
// any row is written.

export interface SubmitAnswerInput {
  questionId: string;
  selectedOptionIndex: number;
}

export interface SubmitQuizAttemptInput {
  userId: string;
  quizId: string;
  answers: SubmitAnswerInput[];
}

export interface QuizScoringDeps {
  quizQuestionRepo: QuizQuestionRepository;
  quizAttemptRepo: QuizAttemptRepository;
}

export async function submitQuizAttempt(deps: QuizScoringDeps, input: SubmitQuizAttemptInput): Promise<QuizAttempt> {
  const questions = await deps.quizQuestionRepo.listByQuiz(input.quizId);
  // A quiz with zero questions covers both "quizId doesn't exist" (FK never
  // validated at this layer -- listByQuiz on a bogus id just returns [])
  // and "quiz exists but was never populated with questions". Either way
  // there is nothing to score, so this is reported as not-found rather than
  // silently returning a 0/0 attempt.
  if (questions.length === 0) {
    throw new NotFoundError('quiz', input.quizId);
  }
  if (input.answers.length !== questions.length) {
    throw new AnswerCountMismatchError(questions.length, input.answers.length);
  }

  // Map lookup, not positional comparison -- the submitted answers array is
  // never assumed to arrive in the same order as listByQuiz's
  // orderIndex-sorted result. A question id that isn't in this quiz's own
  // set (e.g. copy-pasted from a different quiz) is rejected explicitly
  // rather than silently mis-scored against the wrong question.
  const byId = new Map(questions.map((q) => [q.id, q]));
  let score = 0;
  const answers = input.answers.map((answer) => {
    const question = byId.get(answer.questionId);
    if (!question) {
      throw new NotFoundError('quiz question (in this quiz)', answer.questionId);
    }
    const correct = question.correctOptionIndex === answer.selectedOptionIndex;
    if (correct) score += 1;
    return { questionId: answer.questionId, selectedOptionIndex: answer.selectedOptionIndex, correct };
  });

  return deps.quizAttemptRepo.record({
    userId: input.userId,
    quizId: input.quizId,
    score,
    totalQuestions: questions.length,
    answers,
  });
}
