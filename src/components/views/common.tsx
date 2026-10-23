'use client';

import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/primitives';
import { errorMessage } from '@/lib/queries';

/** Loading and error states with retry; children render only with data. */
export function QueryState({ query, children }: { query: Pick<UseQueryResult<unknown>, 'isPending' | 'isError' | 'error' | 'refetch' | 'data'>; children: ReactNode }) {
  if (query.isError && query.data === undefined) {
    return (
      <div role="alert" className="rounded-card border border-line bg-danger p-5 text-on-danger">
        <p className="mb-3">{errorMessage(query.error)}</p>
        <Button onClick={() => void query.refetch()}>Prøv igen</Button>
      </div>
    );
  }
  if (query.isPending) {
    return (
      <p className="py-8 text-muted" aria-busy="true">
        Henter…
      </p>
    );
  }
  return <>{children}</>;
}

export function EmptyFilterResult({ onReset }: { onReset: () => void }) {
  return (
    <div className="rounded-card border border-dashed border-line p-8 text-center">
      <p className="mb-3">Ingen opgaver matcher dine filtre.</p>
      <Button onClick={onReset}>Nulstil filtre</Button>
    </div>
  );
}
