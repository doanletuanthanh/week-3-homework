CREATE TABLE "generation_attempt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"topic_id" text,
	"session_id" uuid,
	"scenario_id" uuid,
	"topic_text" text NOT NULL,
	"focus" text NOT NULL,
	"focus_raw" text DEFAULT '' NOT NULL,
	"moderation_decision" text NOT NULL,
	"reason_code" text,
	"constraints" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"outcome" text NOT NULL,
	"failure_code" text,
	"step" text,
	"run_token" uuid,
	"heartbeat_at" timestamp with time zone,
	"deadline_at" timestamp with time zone,
	"cost_reserved_usd" numeric(14, 9) DEFAULT 0 NOT NULL,
	"cost_actual_usd" numeric(14, 9) DEFAULT 0 NOT NULL,
	"report" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "scenario_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "persona_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "quota_tombstone" ADD COLUMN "free_custom_used" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "quota_tombstone" ADD COLUMN "custom_failed_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quota_tombstone" ADD COLUMN "custom_day" date;--> statement-breakpoint
ALTER TABLE "quota_tombstone" ADD COLUMN "custom_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quota_tombstone" ADD COLUMN "custom_refusals" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quota_tombstone" ADD COLUMN "custom_spend_usd" numeric(14, 9) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "focus" text;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "problem_reported_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "topic" ADD COLUMN "kind" text DEFAULT 'curated' NOT NULL;--> statement-breakpoint
ALTER TABLE "topic" ADD COLUMN "owner_user_id" uuid;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "free_custom_used" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "custom_failed_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_attempt" ADD CONSTRAINT "generation_attempt_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_attempt" ADD CONSTRAINT "generation_attempt_topic_id_topic_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_attempt" ADD CONSTRAINT "generation_attempt_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_attempt" ADD CONSTRAINT "generation_attempt_scenario_id_scenario_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenario"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "generation_attempt_running_key" ON "generation_attempt" USING btree ("user_id") WHERE "generation_attempt"."outcome" = 'running';--> statement-breakpoint
CREATE UNIQUE INDEX "generation_attempt_session_key" ON "generation_attempt" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "generation_attempt_user_idx" ON "generation_attempt" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "topic" ADD CONSTRAINT "topic_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "topic_owner_idx" ON "topic" USING btree ("owner_user_id");--> statement-breakpoint
ALTER TABLE "generation_attempt" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON "generation_attempt" FROM anon, authenticated;
