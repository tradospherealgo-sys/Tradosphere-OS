CREATE TABLE IF NOT EXISTS "analytics_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"label" text,
	"from_date" timestamp with time zone,
	"to_date" timestamp with time zone,
	"total_trades" integer NOT NULL,
	"winning_trades" integer NOT NULL,
	"losing_trades" integer NOT NULL,
	"breakeven_trades" integer NOT NULL,
	"open_trades" integer NOT NULL,
	"total_realized_pnl" double precision NOT NULL,
	"win_rate" double precision,
	"average_return" double precision,
	"average_return_pct" double precision,
	"expectancy" double precision,
	"planned_risk_reward_ratio" double precision,
	"realized_risk_reward_ratio" double precision,
	"max_drawdown_pct" double precision,
	"sharpe_ratio" double precision,
	"sortino_ratio" double precision,
	"as_of" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "analytics_reports" ADD CONSTRAINT "analytics_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_reports_user_idx" ON "analytics_reports" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_reports_user_as_of_idx" ON "analytics_reports" USING btree ("user_id","as_of");