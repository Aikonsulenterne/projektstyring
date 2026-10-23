import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'sm';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary hover:opacity-90 border border-transparent',
  secondary: 'bg-surface text-text border border-line hover:bg-raised',
  ghost: 'bg-transparent text-text border border-transparent hover:bg-raised',
  danger: 'bg-danger text-on-danger border border-transparent hover:opacity-90',
};

const SIZE: Record<Size, string> = {
  md: 'min-h-11 px-4 text-[14px]',
  sm: 'min-h-9 px-3 text-[13px] max-sm:min-h-11',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({ variant = 'secondary', size = 'md', className, type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-control font-medium transition-colors duration-150',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...props}
    />
  );
}

export function Card({ className, children, as: As = 'section', ...rest }: {
  className?: string;
  children: ReactNode;
  as?: 'section' | 'div' | 'article' | 'li';
  'aria-labelledby'?: string;
}) {
  return (
    <As className={cx('rounded-card border border-line bg-surface p-5 sm:p-6', className)} {...rest}>
      {children}
    </As>
  );
}

export function Pill({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'warning' | 'accent'; className?: string }) {
  const toneClass =
    tone === 'warning' ? 'bg-warning text-on-warning' : tone === 'accent' ? 'bg-raised text-accent' : 'bg-raised text-text';
  return (
    <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium whitespace-nowrap', toneClass, className)}>
      {children}
    </span>
  );
}

export function ExampleTag() {
  return (
    <span className="rounded-full border border-line px-2 py-0 text-[11px] text-muted" title="Eksempel fra demoens startindhold">
      Eksempel
    </span>
  );
}

export function FieldLabel({ htmlFor, children, hint }: { htmlFor: string; children: ReactNode; hint?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-[12px] font-medium text-muted">
      {children}
      {hint ? <span className="font-normal"> {hint}</span> : null}
    </label>
  );
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-[12px] text-on-danger" role="alert">
      {message}
    </p>
  );
}

export const controlClass = 'control w-full min-h-11 px-3 text-[14px]';
export const compactControlClass = 'control min-h-9 px-2.5 text-[12px] max-sm:min-h-11';

export function SectionHeading({ id, children, count }: { id?: string; children: ReactNode; count?: number }) {
  return (
    <h2 id={id} className="text-[18px] font-semibold tracking-tight">
      {children}
      {count !== undefined ? <span className="ml-2 text-[14px] font-normal text-muted">{count}</span> : null}
    </h2>
  );
}
