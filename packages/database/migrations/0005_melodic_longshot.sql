CREATE TYPE "public"."cio_verdict_label" AS ENUM('bullish', 'moderately_bullish', 'neutral', 'moderately_bearish', 'bearish');--> statement-breakpoint
CREATE TYPE "public"."journal_entry_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."order_side" AS ENUM('buy', 'sell');--> statement-breakpoint
CREATE TYPE "public"."trade_direction" AS ENUM('long', 'short');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"symbol" text NOT NULL,
	"side" "order_side" NOT NULL,
	"quantity" double precision NOT NULL,
	"fill_price" double precision NOT NULL,
	"filled_at" timestamp with time zone NOT NULL,
	"price_as_of" timestamp with time zone NOT NULL,
	"recommended_direction" "trade_direction",
	"recommended_entry" double precision,
	"recommended_stop_loss" double precision,
	"recommended_target" double precision,
	"recommended_risk_reward_ratio" double precision,
	"cio_verdict" "cio_verdict_label",
	"cio_confidence" double precision,
	"education_note" text,
	"recommendation_generated_at" timestamp with time zone,
	"status" "journal_entry_status" DEFAULT 'open' NOT NULL,
	"exit_price" double precision,
	"exit_at" timestamp with time zone,
	"realized_pnl" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "journal_entries_user_idx" ON "journal_entries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "journal_entries_symbol_idx" ON "journal_entries" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "journal_entries_status_idx" ON "journal_entries" USING btree ("status");