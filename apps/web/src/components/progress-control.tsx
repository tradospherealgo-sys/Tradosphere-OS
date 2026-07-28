'use client';

// Task 10.5: shared progress control reused by course/lesson/strategy/quiz
// browsing. Renders whatever real Progress row the caller already has (from
// the shared listMyProgress() map in education-center.tsx or the direct
// PUT response) -- never fabricates a "not started" row client-side. Two
// explicit actions only: mark in-progress, mark complete. There is no
// "un-complete" action because the backend has no delete-progress route.
import type { Progress } from '@tradosphere/sdk';

export function ProgressControl({
  progress,
  onMark,
}: {
  progress: Progress | undefined;
  onMark: (status: 'in_progress' | 'completed') => void;
}) {
  return (
    <div className="mt-2 flex items-center gap-2">
      <span className="text-xs text-muted" role="status">
        {progress ? `Your progress: ${progress.status}` : 'Not started'}
      </span>
      {progress?.status !== 'in_progress' && progress?.status !== 'completed' && (
        <button
          type="button"
          onClick={() => onMark('in_progress')}
          className="rounded-md border border-border px-2 py-1 text-xs font-medium"
        >
          Mark in progress
        </button>
      )}
      {progress?.status !== 'completed' && (
        <button
          type="button"
          onClick={() => onMark('completed')}
          className="rounded-md border border-border px-2 py-1 text-xs font-medium"
        >
          Mark complete
        </button>
      )}
    </div>
  );
}
