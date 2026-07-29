'use client';

import type { ReactNode } from 'react';

interface PanelProps {
  title?: string;
  subtitle?: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Panel({ title, subtitle, icon, action, children, className = '' }: PanelProps) {
  return (
    <section className={`rounded-2xl border border-border bg-surface ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div className="flex items-center gap-3">
            {icon && (
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10">
                <span className="text-accent">{icon}</span>
              </div>
            )}
            <div>
              {title && <h3 className="text-sm font-semibold">{title}</h3>}
              {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
            </div>
          </div>
          {action && <div className="flex items-center gap-2">{action}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function StatCard({
  label,
  value,
  change,
  icon,
  trend,
}: {
  label: string;
  value: string;
  change?: string;
  icon?: ReactNode;
  trend?: 'up' | 'down' | 'neutral';
}) {
  const trendColors = {
    up: 'text-success',
    down: 'text-danger',
    neutral: 'text-muted',
  };

  return (
    <div className="rounded-xl border border-border bg-bg/30 p-4 transition-all duration-200 hover:border-accent/20 hover:shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
        {icon && <span className="text-muted">{icon}</span>}
      </div>
      <p className="mt-2 text-xl font-bold tabular-nums tracking-tight">{value}</p>
      {change && (
        <p
          className={`mt-1 flex items-center gap-1 text-xs font-medium ${trendColors[trend || 'neutral']}`}
        >
          {trend === 'up' && (
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
            >
              <polyline points="18 15 12 9 6 15" />
            </svg>
          )}
          {trend === 'down' && (
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          )}
          {change}
        </p>
      )}
    </div>
  );
}
