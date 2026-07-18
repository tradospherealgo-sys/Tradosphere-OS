CREATE TABLE IF NOT EXISTS "company_fundamentals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" text NOT NULL,
	"reporting_period" text NOT NULL,
	"pe_ratio" double precision NOT NULL,
	"debt_to_equity" double precision NOT NULL,
	"revenue_growth_yoy_pct" double precision NOT NULL,
	"net_profit_margin_pct" double precision NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "company_fundamentals_symbol_period_unique" ON "company_fundamentals" USING btree ("symbol","reporting_period");