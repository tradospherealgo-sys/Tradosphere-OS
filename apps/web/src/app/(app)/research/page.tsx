'use client';

// Task 10.3: Research Workspace. Scoped to exactly what the gateway
// genuinely exposes as a read (GET /v1/research/fundamentals/{symbol}) per
// Decision D24 -- the other four research disciplines require caller-
// supplied raw market data this app has no source for, so they are not
// built here rather than faked.
import { ResearchLookup } from '@/components/research-lookup';

export default function ResearchPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Research</h1>
        <p className="mt-1 text-sm text-muted">
          Look up the real, already-ingested fundamentals for a symbol.
        </p>
      </div>

      <ResearchLookup />
    </div>
  );
}
