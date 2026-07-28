'use client';

// Task 10.6: Search. Federated real search across the Education content
// types the backend actually supports server-side search on -- see
// global-search.tsx for the full reasoning behind the scope.
import { GlobalSearch } from '@/components/global-search';

export default function SearchPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Search</h1>
        <p className="mt-1 text-sm text-muted">
          Find courses, glossary terms, and strategies from Education.
        </p>
      </div>

      <GlobalSearch />
    </div>
  );
}
