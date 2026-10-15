CREATE TABLE "version_approval" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scenario_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"eval_run_id" uuid NOT NULL,
	"admin_email" text NOT NULL,
	"note" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "adjudication" DROP CONSTRAINT "adjudication_flag_id_admin_email_pk";--> statement-breakpoint
ALTER TABLE "adjudication" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_run" ADD COLUMN "requested_by" text;--> statement-breakpoint
ALTER TABLE "eval_run" ADD COLUMN "run_token" uuid;--> statement-breakpoint
ALTER TABLE "eval_run" ADD COLUMN "heartbeat_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "eval_run" ADD COLUMN "run_attempt" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "version_approval" ADD CONSTRAINT "version_approval_scenario_id_scenario_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenario"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version_approval" ADD CONSTRAINT "version_approval_eval_run_id_eval_run_id_fk" FOREIGN KEY ("eval_run_id") REFERENCES "public"."eval_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "version_approval_scenario_idx" ON "version_approval" USING btree ("scenario_id","at");--> statement-breakpoint
CREATE INDEX "adjudication_flag_idx" ON "adjudication" USING btree ("flag_id","at");--> statement-breakpoint
-- A lean run left "running" by a CLI that died has no runner and no heartbeat: close it, so the
-- one-live-run index can be built and the version can be evaluated again.
UPDATE "eval_run" SET "status" = 'failed', "failure_reason" = 'lost', "finished_at" = now() WHERE "profile" = 'lean' AND "status" IN ('queued', 'running');--> statement-breakpoint
CREATE UNIQUE INDEX "eval_run_live_lean_key" ON "eval_run" USING btree ("scenario_id") WHERE "eval_run"."profile" = 'lean' AND "eval_run"."status" IN ('queued', 'running');--> statement-breakpoint
ALTER TABLE "version_approval" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON "version_approval" FROM anon, authenticated;
