'use client';

import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'gradient';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  header?: ReactNode;
  footer?: ReactNode;
}

const variantClasses = {
  default: 'border border-border bg-surface',
  elevated: 'border border-border/50 bg-surface shadow-lg shadow-black/5',
  gradient: 'border border-border/50 bg-gradient-to-br from-surface via-surface to-accent/[0.02]',
};

const paddingClasses = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-5',
};

export function Card({
  variant = 'default',
  padding = 'md',
  header,
  footer,
  children,
  className = '',
  ...props
}: CardProps) {
  return (
    <div
      className={`rounded-2xl transition-all duration-200 ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {header && (
        <div
          className={`flex items-center justify-between border-b border-border ${paddingClasses[padding]}`}
        >
          {header}
        </div>
      )}
      {children && (
        <div className={!header && !footer ? paddingClasses[padding] : paddingClasses[padding]}>
          {children}
        </div>
      )}
      {footer && (
        <div className={`border-t border-border ${paddingClasses[padding]}`}>{footer}</div>
      )}
    </div>
  );
}

export function CardGrid({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 ${className}`} {...props}>
      {children}
    </div>
  );
}
