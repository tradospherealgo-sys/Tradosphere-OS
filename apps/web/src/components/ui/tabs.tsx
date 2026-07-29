'use client';

import { useState, type ReactNode } from 'react';

interface Tab {
  id: string;
  label: string;
  icon?: ReactNode;
  count?: number;
}

interface TabsProps {
  tabs: Tab[];
  activeTab?: string;
  onChange?: (tabId: string) => void;
  className?: string;
}

export function Tabs({ tabs, activeTab, onChange, className = '' }: TabsProps) {
  const [internalTab, setInternalTab] = useState(tabs[0]?.id);
  const currentTab = activeTab ?? internalTab;

  return (
    <div className={`flex gap-0.5 rounded-xl bg-bg/50 p-0.5 ${className}`}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => {
            setInternalTab(tab.id);
            onChange?.(tab.id);
          }}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
            currentTab === tab.id ? 'bg-surface text-text shadow-sm' : 'text-muted hover:text-text'
          }`}
        >
          {tab.icon && <span className="shrink-0">{tab.icon}</span>}
          {tab.label}
          {tab.count !== undefined && (
            <span
              className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                currentTab === tab.id ? 'bg-accent/10 text-accent' : 'bg-bg text-muted'
              }`}
            >
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function TabContent({
  id,
  activeTab,
  children,
}: {
  id: string;
  activeTab: string;
  children: ReactNode;
}) {
  if (id !== activeTab) return null;
  return <div className="animate-fade-in">{children}</div>;
}
