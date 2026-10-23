'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, cx } from './primitives';

export interface SheetProps {
  open: boolean;
  title: string;
  description?: string;
  /** Checked on every close attempt (Escape, backdrop, close button, Annuller). */
  isDirty: () => boolean;
  /** Saves; resolves true when it is safe to close. */
  onSave: () => Promise<boolean>;
  /** Close without saving (after confirmation when dirty). */
  onClose: () => void;
  footer: ReactNode;
  children: ReactNode;
  /** Exposes the guarded close so footers can wire "Annuller" to it. */
  closeRef?: React.RefObject<(() => void) | null>;
}

/**
 * Right-hand sheet. Focus is trapped inside and returned to the opener after an
 * actual close. Closing with unsaved changes asks Gem / Kassér / Bliv; the backdrop
 * never discards silently.
 */
export function Sheet({ open, title, description, isDirty, onSave, onClose, footer, children, closeRef }: SheetProps) {
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const stayRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open && document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
      opener.current = document.activeElement;
    }
    if (!open) setConfirming(false);
  }, [open]);

  useEffect(() => {
    if (confirming) stayRef.current?.focus();
  }, [confirming]);

  const attemptClose = () => {
    if (isDirty()) setConfirming(true);
    else onClose();
  };

  useEffect(() => {
    if (closeRef) closeRef.current = attemptClose;
  });

  const saveAndClose = async () => {
    setSaving(true);
    try {
      // On success the parent closes the sheet; on failure the inline error shows.
      await onSave();
      setConfirming(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => (next ? undefined : attemptClose())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay" />
        <Dialog.Content
          className={cx(
            'fixed inset-y-0 right-0 z-50 flex w-full max-w-[580px] flex-col border-l border-line bg-bg shadow-2xl',
            'focus:outline-none',
          )}
          onCloseAutoFocus={(event) => {
            const target = opener.current;
            if (target && document.contains(target)) {
              event.preventDefault();
              target.focus();
            }
          }}
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
            <div className="min-w-0">
              <Dialog.Title className="text-[18px] font-semibold tracking-tight">{title}</Dialog.Title>
              {description ? <Dialog.Description className="text-[13px] text-muted">{description}</Dialog.Description> : null}
            </div>
            <Button variant="ghost" size="sm" aria-label="Luk panelet" onClick={attemptClose} className="!min-h-11 !px-3">
              <X size={18} aria-hidden />
            </Button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>

          {confirming ? (
            <div
              role="alertdialog"
              aria-labelledby="unsaved-title"
              className="border-t border-line bg-warning px-5 py-4 text-on-warning sm:px-6"
            >
              <p id="unsaved-title" className="mb-3 font-medium">
                Du har ændringer, der ikke er gemt.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" onClick={saveAndClose} disabled={saving}>
                  {saving ? 'Gemmer…' : 'Gem'}
                </Button>
                <Button
                  onClick={() => {
                    setConfirming(false);
                    onClose();
                  }}
                >
                  Kassér
                </Button>
                <Button ref={stayRef} variant="ghost" onClick={() => setConfirming(false)}>
                  Bliv
                </Button>
              </div>
            </div>
          ) : (
            <footer className="border-t border-line px-5 py-4 sm:px-6">{footer}</footer>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
