CREATE TABLE "admin_access_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_email" text NOT NULL,
	"channel" text NOT NULL,
	"session_id" uuid,
	"user_id" uuid,
	"action" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "branch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "config" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"session_id" uuid,
	"name" text NOT NULL,
	"props" jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "snapshot" (
	"session_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"index" integer NOT NULL,
	"unlocked" jsonb NOT NULL,
	"ledger" jsonb NOT NULL,
	"disclosed" jsonb NOT NULL,
	"openness" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "snapshot_branch_id_index_pk" PRIMARY KEY("branch_id","index")
);
--> statement-breakpoint
DROP INDEX "session_user_persona_key";--> statement-breakpoint
ALTER TABLE "llm_call" ADD COLUMN "turn_index" integer;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "ended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "turn_claim" jsonb;--> statement-breakpoint
-- The two NOT NULL columns of "turn" are added nullable, filled for the rows that exist, then tightened.
ALTER TABLE "turn" ADD COLUMN "branch_id" uuid;--> statement-breakpoint
ALTER TABLE "turn" ADD COLUMN "turn_key" uuid;--> statement-breakpoint
ALTER TABLE "turn" ADD COLUMN "learner_tokens" jsonb;--> statement-breakpoint
ALTER TABLE "turn" ADD COLUMN "persona_tokens" jsonb;--> statement-breakpoint
ALTER TABLE "turn" ADD COLUMN "analysis_json" jsonb;--> statement-breakpoint
ALTER TABLE "turn" ADD COLUMN "decision_json" jsonb;--> statement-breakpoint
ALTER TABLE "turn" ADD COLUMN "verdict_json" jsonb;--> statement-breakpoint
ALTER TABLE "turn" ADD COLUMN "hook_selected" text;--> statement-breakpoint
ALTER TABLE "turn" ADD COLUMN "flagged" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Sessions written before the turn engine: give each a main branch, tokens for every line, and a
-- snapshot per turn. Those turns ran no unlock rule, so every snapshot is the starting state.
INSERT INTO "branch" ("session_id", "kind") SELECT "id", 'main' FROM "session";--> statement-breakpoint
UPDATE "turn" SET
	"branch_id" = "branch"."id",
	"persona_tokens" = to_jsonb(regexp_split_to_array(btrim("turn"."persona_text", E' \t\n\r'), '\s+')),
	"learner_tokens" = CASE
		WHEN "turn"."learner_text" IS NULL THEN NULL
		ELSE to_jsonb(regexp_split_to_array(btrim("turn"."learner_text", E' \t\n\r'), '\s+'))
	END
FROM "branch"
WHERE "branch"."session_id" = "turn"."session_id" AND "branch"."kind" = 'main';--> statement-breakpoint
INSERT INTO "snapshot" ("session_id", "branch_id", "index", "unlocked", "ledger", "disclosed", "openness")
SELECT "turn"."session_id", "turn"."branch_id", "turn"."index", '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
	COALESCE(("scenario"."content"->>'openness_start')::integer, 4)
FROM "turn"
JOIN "session" ON "session"."id" = "turn"."session_id"
JOIN "scenario" ON "scenario"."id" = "session"."scenario_id";--> statement-breakpoint
ALTER TABLE "turn" ALTER COLUMN "branch_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "turn" ALTER COLUMN "persona_tokens" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "turn" DROP CONSTRAINT "turn_session_id_index_pk";--> statement-breakpoint
ALTER TABLE "turn" ADD CONSTRAINT "turn_branch_id_index_pk" PRIMARY KEY("branch_id","index");--> statement-breakpoint
ALTER TABLE "admin_access_log" ADD CONSTRAINT "admin_access_log_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_access_log" ADD CONSTRAINT "admin_access_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch" ADD CONSTRAINT "branch_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshot" ADD CONSTRAINT "snapshot_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshot" ADD CONSTRAINT "snapshot_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "branch_session_main_key" ON "branch" USING btree ("session_id") WHERE "branch"."kind" = 'main';--> statement-breakpoint
CREATE INDEX "event_name_at_idx" ON "event" USING btree ("name","at");--> statement-breakpoint
CREATE INDEX "snapshot_session_idx" ON "snapshot" USING btree ("session_id");--> statement-breakpoint
ALTER TABLE "turn" ADD CONSTRAINT "turn_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "turn_session_idx" ON "turn" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "session_user_persona_key" ON "session" USING btree ("user_id","persona_id") WHERE "session"."is_demo" = false AND "session"."status" <> 'withdrawn';--> statement-breakpoint
ALTER TABLE "turn" ADD CONSTRAINT "turn_session_turn_key_key" UNIQUE("session_id","turn_key");--> statement-breakpoint
-- New tables get the same treatment as the first ones: RLS on with no policy, no grant to the Data API roles.
ALTER TABLE "admin_access_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "branch" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "config" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "event" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "snapshot" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON "admin_access_log", "branch", "config", "event", "snapshot" FROM anon, authenticated;
