'use client';

import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { Button } from './primitives';

export interface ConfirmAction {
  label: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  onSelect: () => void;
}

/** Small accessible confirmation dialog. Cancel is always available and focused first. */
export function ConfirmDialog({
  open,
  title,
  children,
  actions,
  cancelLabel = 'Annuller',
  onCancel,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  actions: ConfirmAction[];
  cancelLabel?: string;
  onCancel: () => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => (next ? undefined : onCancel())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-overlay" />
        <Dialog.Content
          role="alertdialog"
          className="fixed left-1/2 top-1/2 z-[80] w-[calc(100%-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-card border border-line bg-surface p-6 shadow-2xl focus:outline-none"
          aria-describedby={undefined}
        >
          <Dialog.Title className="mb-2 text-[17px] font-semibold">{title}</Dialog.Title>
          <div className="mb-5 text-[14px] text-muted">{children}</div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={onCancel} autoFocus>
              {cancelLabel}
            </Button>
            {actions.map((action) => (
              <Button key={action.label} variant={action.variant ?? 'primary'} onClick={action.onSelect}>
                {action.label}
              </Button>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
