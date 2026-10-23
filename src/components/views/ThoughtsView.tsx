'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { THOUGHT_TYPES, type ThoughtQuery, type ThoughtType } from '@/domain/entities';
import { THOUGHT_TYPE_LABEL } from '@/domain/labels';
import { PageHeader } from '@/components/shell/AppShell';
import { ThoughtList } from '@/components/thoughts/ThoughtCard';
import { Button, compactControlClass, controlClass, cx } from '@/components/ui/primitives';
import { useMutationRunner, useThoughts } from '@/lib/queries';
import { useQueryParams } from '@/lib/url-state';
import { QueryState } from './common';

/** Free-text capture first, organisation later. Thought filters are separate from task filters. */
export function ThoughtsView() {
  const { params, set } = useQueryParams();
  const type = (THOUGHT_TYPES as readonly string[]).includes(params.get('type') ?? '') ? (params.get('type') as ThoughtType) : undefined;
  const q = params.get('tq') ?? '';
  const query = useMemo<ThoughtQuery>(() => ({ type, q: q || undefined }), [type, q]);
  const thoughts = useThoughts(query);
  const ids = { type: useId(), q: useId() };
  const [search, setSearch] = useState(q);
  const pushed = useRef(q);

  useEffect(() => {
    if (q !== pushed.current) {
      pushed.current = q;
      setSearch(q);
    }
  }, [q]);
  useEffect(() => {
    if (search === pushed.current) return;
    const timer = window.setTimeout(() => {
      pushed.current = search;
      set({ tq: search });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [search, set]);

  return (
    <>
      <PageHeader title="Tanker" />
      <div className="mb-6">
        <h2 className="text-[30px] font-bold leading-tight tracking-tight sm:text-[34px]">Giv tankerne plads.</h2>
        <p className="mt-1 text-muted">Skriv først. Organisér senere.</p>
      </div>
      <ThoughtComposer />
      <div className="my-5 flex flex-wrap items-end gap-3" role="group" aria-label="Filtrér tanker">
        <div>
          <label htmlFor={ids.q} className="mb-1 block text-[12px] text-muted">
            Søg
          </label>
          <input id={ids.q} type="search" className={cx(compactControlClass, 'w-52')} placeholder="Find tanke" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div>
          <label htmlFor={ids.type} className="mb-1 block text-[12px] text-muted">
            Type
          </label>
          <select id={ids.type} className={compactControlClass} value={type ?? ''} onChange={(e) => set({ type: e.target.value })}>
            <option value="">Alle typer</option>
            {THOUGHT_TYPES.map((t) => (
              <option key={t} value={t}>
                {THOUGHT_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <Button variant="ghost" size="sm" disabled={!type && !q} onClick={() => set({ type: null, tq: null })}>
          Nulstil
        </Button>
        <p className="pb-2 text-[12px] text-muted" aria-live="polite">
          {thoughts.data ? `${thoughts.data.totalMatching} ${thoughts.data.totalMatching === 1 ? 'tanke' : 'tanker'}` : ''}
        </p>
      </div>
      <QueryState query={thoughts}>
        <ThoughtList thoughts={thoughts.data?.items ?? []} empty={type || q ? 'Ingen tanker matcher dine filtre.' : 'Ingen tanker endnu. Skriv den første ovenfor.'} />
      </QueryState>
    </>
  );
}

function ThoughtComposer() {
  const run = useMutationRunner();
  const [body, setBody] = useState('');
  const [type, setType] = useState<ThoughtType>('idea');
  const [pending, setPending] = useState(false);
  const key = useRef<{ body: string; key: string } | null>(null);
  const ids = { body: useId(), type: useId() };

  const submit = async () => {
    const value = body.trim();
    if (!value || pending) return;
    if (!key.current || key.current.body !== `${type}:${value}`) key.current = { body: `${type}:${value}`, key: crypto.randomUUID() };
    setPending(true);
    try {
      await run((r) => r.createThought({ body: value, type }, { idempotencyKey: key.current!.key }), {
        success: 'Tanken er gemt.',
        undo: (t, r) => () => r.archiveThought(t.id, t.version),
      });
      setBody('');
      key.current = null;
    } catch {
      // Announced by the runner; the text stays.
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label htmlFor={ids.body} className="sr-only">
        Ny tanke
      </label>
      <textarea
        id={ids.body}
        className={cx(controlClass, 'min-h-24 py-2')}
        placeholder="Skriv noget. Enter gemmer, Shift+Enter giver ny linje."
        value={body}
        maxLength={20_000}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void submit();
          }
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <label htmlFor={ids.type} className="text-[12px] text-muted">
            Type
          </label>
          <select id={ids.type} className={compactControlClass} value={type} onChange={(e) => setType(e.target.value as ThoughtType)}>
            {THOUGHT_TYPES.map((t) => (
              <option key={t} value={t}>
                {THOUGHT_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="primary" disabled={!body.trim() || pending}>
          {pending ? 'Gemmer…' : 'Tilføj'}
        </Button>
      </div>
    </form>
  );
}
