CREATE TABLE IF NOT EXISTS "market_ticks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" text NOT NULL,
	"price" double precision NOT NULL,
	"volume" integer NOT NULL,
	"tick_timestamp" timestamp with time zone NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "market_ticks_symbol_tick_unique" ON "market_ticks" USING btree ("symbol","tick_timestamp");