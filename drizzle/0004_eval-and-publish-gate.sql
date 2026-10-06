CREATE TABLE "adjudication" (
	"flag_id" uuid NOT NULL,
	"admin_email" text NOT NULL,
	"verdict" text NOT NULL,
	"reason" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "adjudication_flag_id_admin_email_pk" PRIMARY KEY("flag_id","admin_email")
);
--> statement-breakpoint
CREATE TABLE "eval_episode" (
	"run_id" uuid NOT NULL,
	"key" text NOT NULL,
	"result_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "eval_episode_run_id_key_pk" PRIMARY KEY("run_id","key")
);
--> statement-breakpoint
CREATE TABLE "eval_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scenario_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"profile" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"turns" integer NOT NULL,
	"report_json" jsonb,
	"cost_estimate_usd" numeric(14, 9) NOT NULL,
	"cost_actual_usd" numeric(14, 9) DEFAULT 0 NOT NULL,
	"reader_notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "leak_flag" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"eval_run_id" uuid NOT NULL,
	"episode" text NOT NULL,
	"turn" integer NOT NULL,
	"item_id" text NOT NULL,
	"kind" text NOT NULL,
	"excerpt" text NOT NULL,
	"allowed_hooks" jsonb NOT NULL,
	"judge_reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "string_approval" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"persona_id" text DEFAULT '' NOT NULL,
	"string_key" text NOT NULL,
	"text" text NOT NULL,
	"text_hash" text NOT NULL,
	"fr36_result" jsonb NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decision" text,
	"approver_email" text,
	"note" text,
	"decided_at" timestamp with time zone,
	CONSTRAINT "string_approval_text_key" UNIQUE("scope","persona_id","string_key","text_hash")
);
--> statement-breakpoint
ALTER TABLE "adjudication" ADD CONSTRAINT "adjudication_flag_id_leak_flag_id_fk" FOREIGN KEY ("flag_id") REFERENCES "public"."leak_flag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_episode" ADD CONSTRAINT "eval_episode_run_id_eval_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."eval_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_run" ADD CONSTRAINT "eval_run_scenario_id_scenario_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenario"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leak_flag" ADD CONSTRAINT "leak_flag_eval_run_id_eval_run_id_fk" FOREIGN KEY ("eval_run_id") REFERENCES "public"."eval_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eval_run_scenario_idx" ON "eval_run" USING btree ("scenario_id");--> statement-breakpoint
CREATE INDEX "leak_flag_run_idx" ON "leak_flag" USING btree ("eval_run_id");
--> statement-breakpoint
-- New tables get the same treatment as the first ones: RLS on with no policy, no grant to the Data API roles.
ALTER TABLE "adjudication" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "eval_episode" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "eval_run" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "leak_flag" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "string_approval" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON "adjudication", "eval_episode", "eval_run", "leak_flag", "string_approval" FROM anon, authenticated;
