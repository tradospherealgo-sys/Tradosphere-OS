'use client';

// Task 10.5: Education Center. Mounts the real course/glossary/strategy/quiz
// browsing plus real quiz-taking and progress tracking -- see
// education-center.tsx for the composition and the superset-avoidance
// reasoning behind each sub-library's data fetching.
import { EducationCenter } from '@/components/education-center';

export default function EducationPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Education Center</h1>
        <p className="mt-1 text-sm text-muted">
          Real courses, lessons, glossary terms, strategies, and quizzes from the education service.
        </p>
      </div>

      <EducationCenter />
    </div>
  );
}
