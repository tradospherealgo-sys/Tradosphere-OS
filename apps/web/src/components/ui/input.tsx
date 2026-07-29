'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helper?: string;
  icon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helper, icon, className = '', id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-xs font-medium text-text/70">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={`h-9 w-full rounded-xl border bg-bg/50 px-3.5 text-sm text-text placeholder:text-muted/40 transition-all duration-150 focus:border-accent/50 focus:bg-bg focus:outline-none focus:ring-2 focus:ring-accent/10 ${
              error ? 'border-danger/50 focus:border-danger focus:ring-danger/10' : 'border-border'
            } ${icon ? 'pl-10' : ''} ${className}`}
            {...props}
          />
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
        {helper && !error && <p className="text-xs text-muted/60">{helper}</p>}
      </div>
    );
  },
);

Input.displayName = 'Input';
