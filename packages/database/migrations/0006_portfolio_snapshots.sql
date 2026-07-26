CREATE TABLE IF NOT EXISTS "portfolio_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"cash_balance" double precision NOT NULL,
	"positions_value" double precision NOT NULL,
	"realized_pnl" double precision NOT NULL,
	"unrealized_pnl" double precision NOT NULL,
	"total_equity" double precision NOT NULL,
	"label" text,
	"as_of" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "portfolio_snapshots" ADD CONSTRAINT "portfolio_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portfolio_snapshots_user_idx" ON "portfolio_snapshots" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portfolio_snapshots_user_as_of_idx" ON "portfolio_snapshots" USING btree ("user_id","as_of");