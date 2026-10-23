'use client';

import { useId, useRef, useState } from 'react';
import { MESSAGES } from '@/domain/errors';
import { prepareImport, SOURCE_LABEL, type ImportPreview } from '@/demo/migrations';
import { useRuntime } from '@/components/shell/WorkspaceProvider';
import { useShell } from '@/components/shell/ShellContext';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toasts';
import { Button } from '@/components/ui/primitives';
import { errorMessage } from '@/lib/queries';

export function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function stamp(): string {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

/** Validate -> preview -> explicit confirm. Current data is exported before replacing it. */
function ImportFlow({ initialText, onDone }: { initialText?: string | null; onDone: () => void }) {
  const runtime = useRuntime();
  const toast = useToast();
  const fileId = useId();
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const inspect = (text: string) => {
    const result = prepareImport(text, new Date().toISOString(), () => crypto.randomUUID());
    if (result.ok) {
      setPreview(result.preview);
      setErrors([]);
    } else {
      setPreview(null);
      setErrors(result.errors);
    }
  };

  const restore = () => {
    const demo = runtime.demo;
    if (!demo || !preview) return;
    try {
      // Keep a copy of what is there now – readable or not – before replacing it.
      const current = runtime.demoLoadState?.status === 'ok' ? demo.exportBackup() : demo.exportRaw();
      if (current) downloadText(`teamspace-foer-gendannelse-${stamp()}.json`, current);
      demo.restore(preview.data);
      setConfirming(false);
      runtime.reloadDemo();
      toast({ message: 'Backup gendannet.' });
      onDone();
    } catch (error) {
      setConfirming(false);
      toast({ message: errorMessage(error), tone: 'error' });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {initialText ? (
        <Button onClick={() => inspect(initialText)}>Forhåndsvis data fra tidligere prototype</Button>
      ) : (
        <div>
          <label htmlFor={fileId} className="mb-1 block text-[12px] text-muted">
            Vælg en backupfil (.json, højst 10 MB)
          </label>
          <input
            ref={inputRef}
            id={fileId}
            type="file"
            accept="application/json,.json"
            className="block w-full text-[13px] file:mr-3 file:min-h-11 file:rounded-control file:border file:border-line file:bg-surface file:px-4 file:text-text"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 10 * 1024 * 1024) {
                setPreview(null);
                setErrors(['Filen er større end 10 MB.']);
                return;
              }
              inspect(await file.text());
            }}
          />
        </div>
      )}
      {errors.length ? (
        <div role="alert" className="rounded-control bg-danger px-3 py-3 text-[13px] text-on-danger">
          <p className="mb-1 font-medium">Filen kan ikke gendannes. Dine nuværende data er uændrede.</p>
          <ul className="list-disc pl-5">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {preview ? (
        <div className="rounded-control border border-line bg-surface px-3 py-3 text-[13px]" role="status">
          <p className="font-medium">Klar til gendannelse fra {SOURCE_LABEL[preview.source]}</p>
          <p className="text-muted">
            {preview.counts.projects} projekter · {preview.counts.tasks} opgaver · {preview.counts.thoughts} tanker
          </p>
          {preview.warnings.length ? (
            <ul className="mt-2 list-disc pl-5 text-muted">
              {preview.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          ) : null}
          <Button variant="primary" className="mt-3" onClick={() => setConfirming(true)}>
            Gendan backup
          </Button>
        </div>
      ) : null}
      <ConfirmDialog
        open={confirming}
        title="Erstat de nuværende data?"
        onCancel={() => setConfirming(false)}
        actions={[{ label: 'Gendan backup', variant: 'danger', onSelect: restore }]}
      >
        Alt indhold i denne browser bliver erstattet af backuppen. Vi downloader først en kopi af det nuværende indhold.
      </ConfirmDialog>
    </div>
  );
}

function ResetToExamples({ onDone }: { onDone: () => void }) {
  const runtime = useRuntime();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <Button variant="ghost" onClick={() => setConfirming(true)}>
        Start forfra med eksempeldata
      </Button>
      <ConfirmDialog
        open={confirming}
        title="Start forfra med eksempeldata?"
        onCancel={() => setConfirming(false)}
        actions={[
          {
            label: 'Start forfra',
            variant: 'danger',
            onSelect: () => {
              const demo = runtime.demo;
              if (!demo) return;
              const current = runtime.demoLoadState?.status === 'ok' ? demo.exportBackup() : demo.exportRaw();
              if (current) downloadText(`teamspace-foer-nulstilling-${stamp()}.json`, current);
              try {
                demo.resetToExamples();
                runtime.reloadDemo();
                toast({ message: 'Eksempeldata er indlæst.' });
                onDone();
              } catch (error) {
                toast({ message: errorMessage(error), tone: 'error' });
              }
              setConfirming(false);
            },
          },
        ]}
      >
        Alt indhold i denne browser bliver erstattet af eksempler. Vi downloader først en kopi af det nuværende indhold.
      </ConfirmDialog>
    </>
  );
}

export function BackupPanel() {
  const runtime = useRuntime();
  const shell = useShell();
  const toast = useToast();
  const demo = runtime.demo;
  const legacy = demo?.legacyRaw();

  return (
    <Sheet
      open
      title="Backup"
      description="Data i demoen ligger kun i denne browser. Eksportér jævnligt."
      isDirty={() => false}
      onSave={async () => true}
      onClose={shell.close}
      footer={<Button onClick={shell.close}>Luk</Button>}
    >
      <div className="flex flex-col gap-8">
        <section aria-labelledby="export-heading">
          <h3 id="export-heading" className="mb-2 font-semibold">
            Eksportér backup
          </h3>
          <Button
            variant="primary"
            onClick={() => {
              try {
                downloadText(`teamspace-backup-${stamp()}.json`, demo!.exportBackup());
                toast({ message: 'Backup downloadet.' });
              } catch (error) {
                toast({ message: errorMessage(error), tone: 'error' });
              }
            }}
          >
            Eksportér backup
          </Button>
        </section>
        <section aria-labelledby="restore-heading">
          <h3 id="restore-heading" className="mb-2 font-semibold">
            Gendan backup
          </h3>
          <ImportFlow onDone={shell.close} />
        </section>
        {legacy ? (
          <section aria-labelledby="legacy-heading">
            <h3 id="legacy-heading" className="mb-1 font-semibold">
              Data fra den tidligere prototype
            </h3>
            <p className="mb-2 text-[13px] text-muted">Vi har fundet data fra den tidligere prototype i browseren. De bliver ikke importeret automatisk, og originalen forbliver uændret.</p>
            <ImportFlow initialText={legacy} onDone={shell.close} />
          </section>
        ) : null}
        <section aria-labelledby="reset-heading">
          <h3 id="reset-heading" className="mb-2 font-semibold">
            Nulstil
          </h3>
          <ResetToExamples onDone={shell.close} />
        </section>
      </div>
    </Sheet>
  );
}

/** Shown instead of the views when stored data cannot be read. Nothing is overwritten. */
export function RecoveryScreen() {
  const runtime = useRuntime();
  const state = runtime.demoLoadState;
  const raw = runtime.demo?.exportRaw();
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div role="alert" className="rounded-card bg-danger p-5 text-on-danger">
        <p className="font-semibold">{MESSAGES.storageCorrupt}</p>
        {state?.status === 'unsupported' ? <p className="mt-1 text-[13px]">Data er gemt af en nyere version af teamspace.</p> : null}
        {state?.status === 'corrupt' && state.errors.length ? (
          <details className="mt-2 text-[13px]">
            <summary className="cursor-pointer">Tekniske detaljer</summary>
            <ul className="mt-1 list-disc pl-5">
              {state.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
      <section aria-labelledby="recover-export">
        <h2 id="recover-export" className="mb-2 font-semibold">
          1. Gem en kopi
        </h2>
        <Button variant="primary" disabled={!raw} onClick={() => raw && downloadText(`teamspace-ulaeselige-data-${stamp()}.json`, raw)}>
          Eksportér gemte data
        </Button>
      </section>
      <section aria-labelledby="recover-restore">
        <h2 id="recover-restore" className="mb-2 font-semibold">
          2. Gendan en gyldig backup
        </h2>
        <ImportFlow onDone={() => undefined} />
      </section>
      <section aria-labelledby="recover-reset">
        <h2 id="recover-reset" className="mb-2 font-semibold">
          Eller start forfra
        </h2>
        <ResetToExamples onDone={() => undefined} />
      </section>
    </div>
  );
}
