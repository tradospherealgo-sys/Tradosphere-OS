'use client';

import type { ReactNode } from 'react';

type BadgeColor = 'accent' | 'success' | 'danger' | 'warning' | 'neutral';
type BadgeVariant = 'solid' | 'soft' | 'outline';

interface BadgeProps {
  color?: BadgeColor;
  variant?: BadgeVariant;
  dot?: boolean;
  children: ReactNode;
  className?: string;
}

const colorSolid: Record<BadgeColor, string> = {
  accent: 'bg-accent text-white',
  success: 'bg-success text-white',
  danger: 'bg-danger text-white',
  warning: 'bg-amber-500 text-white',
  neutral: 'bg-muted/20 text-muted',
};

const colorSoft: Record<BadgeColor, string> = {
  accent: 'bg-accent/10 text-accent',
  success: 'bg-success/10 text-success',
  danger: 'bg-danger/10 text-danger',
  warning: 'bg-amber-500/10 text-amber-500',
  neutral: 'bg-muted/10 text-muted',
};

const colorOutline: Record<BadgeColor, string> = {
  accent: 'border border-accent/30 text-accent',
  success: 'border border-success/30 text-success',
  danger: 'border border-danger/30 text-danger',
  warning: 'border border-amber-500/30 text-amber-500',
  neutral: 'border border-border text-muted',
};

const dotColors: Record<BadgeColor, string> = {
  accent: 'bg-accent',
  success: 'bg-success',
  danger: 'bg-danger',
  warning: 'bg-amber-500',
  neutral: 'bg-muted',
};

export function Badge({
  color = 'neutral',
  variant = 'soft',
  dot,
  children,
  className = '',
}: BadgeProps) {
  const colorMap =
    variant === 'solid' ? colorSolid : variant === 'outline' ? colorOutline : colorSoft;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none ${
        variant === 'outline' ? '' : ''
      } ${colorMap[color]} ${className}`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dotColors[color]}`} />}
      {children}
    </span>
  );
}
