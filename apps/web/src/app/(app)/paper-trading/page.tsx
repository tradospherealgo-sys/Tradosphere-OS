'use client';

import { useState } from 'react';
import { OrderForm } from '@/components/order-form';
import { TradeIdeasFeed } from '@/components/trade-ideas-feed';
import { useMarketStream } from '@/hooks/use-market-stream';
import { Card, Tabs, TabContent, Badge, Panel } from '@/components/ui';

export default function PaperTradingPage() {
  const { status, ticksBySymbol, verdictHistory } = useMarketStream();
  const [activeTab, setActiveTab] = useState('positions');

  const tabs = [
    { id: 'positions', label: 'Positions', count: 0 },
    { id: 'orders', label: 'Orders', count: 0 },
    { id: 'history', label: 'History' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Paper Trading</h1>
          <p className="text-sm text-muted">Practice trading with real-time market data</p>
        </div>
        <Badge color={status === 'open' ? 'success' : 'neutral'} variant="soft" dot>
          {status === 'open' ? 'Market Open' : 'Market Closed'}
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        {/* Chart area - placeholder for real chart */}
        <div className="space-y-5 xl:col-span-2">
          <Panel
            title="Chart"
            icon={
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            }
            action={
              <div className="flex gap-1">
                {['1m', '5m', '15m', '1H', '4H', '1D'].map((tf) => (
                  <button
                    key={tf}
                    className="rounded-md px-2 py-1 text-[11px] font-medium text-muted/70 hover:bg-bg hover:text-text transition-colors"
                  >
                    {tf}
                  </button>
                ))}
              </div>
            }
          >
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-bg">
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="text-muted/40"
                >
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
              </div>
              <p className="mt-4 text-sm font-medium text-muted">
                Choose a symbol to start trading
              </p>
              <p className="mt-1 text-xs text-muted/60">
                Search for a stock above or pick from your watchlist
              </p>
            </div>
          </Panel>

          {/* Below chart tabs */}
          <Card>
            <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} className="mb-0" />
            <div className="mt-4">
              <TabContent id="positions" activeTab={activeTab}>
                <p className="py-8 text-center text-sm text-muted">No open positions</p>
              </TabContent>
              <TabContent id="orders" activeTab={activeTab}>
                <p className="py-8 text-center text-sm text-muted">No pending orders</p>
              </TabContent>
              <TabContent id="history" activeTab={activeTab}>
                <p className="py-8 text-center text-sm text-muted">No trade history yet</p>
              </TabContent>
            </div>
          </Card>
        </div>

        {/* Order entry panel */}
        <div className="space-y-5">
          <Panel
            title="Order Entry"
            icon={
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            }
          >
            <OrderForm />
          </Panel>

          <TradeIdeasFeed verdictHistory={verdictHistory} />
        </div>
      </div>
    </div>
  );
}
