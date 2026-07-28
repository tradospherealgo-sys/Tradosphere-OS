'use client';

// Task 10.6: Settings. Real account info + theme control -- see
// settings-panel.tsx for the full reasoning behind what is and isn't shown.
import { SettingsPanel } from '@/components/settings-panel';

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-muted">Your account and appearance preferences.</p>
      </div>

      <SettingsPanel />
    </div>
  );
}
