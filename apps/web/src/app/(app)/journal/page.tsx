'use client';

// Task 10.4: Journal. Mounts the real entry list + outcome-recording form --
// see journal-list.tsx for the GET /v1/journal/entries + POST .../outcome
// round trip (write-once server-side, a second call surfaces a real 409).
import { JournalList } from '@/components/journal-list';

export default function JournalPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Journal</h1>
        <p className="mt-1 text-sm text-muted">The durable record of every real paper trade.</p>
      </div>

      <JournalList />
    </div>
  );
}
