'use client';

// Task 10.4: Paper Trading. Mounts the real order-entry form only -- see
// order-form.tsx for the POST /v1/paper-trading/orders + save-to-journal
// round trip.
import { OrderForm } from '@/components/order-form';

export default function PaperTradingPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Paper Trading</h1>
        <p className="mt-1 text-sm text-muted">
          Place a real paper order against the latest recorded market price.
        </p>
      </div>

      <OrderForm />
    </div>
  );
}
