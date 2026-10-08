ALTER TABLE "branch" ADD COLUMN "fork_after_turn" integer;--> statement-breakpoint
ALTER TABLE "branch" ADD COLUMN "target_item_id" text;--> statement-breakpoint
ALTER TABLE "branch" ADD COLUMN "fallback_level" text;--> statement-breakpoint
ALTER TABLE "branch" ADD COLUMN "result" text;--> statement-breakpoint
ALTER TABLE "llm_call" ADD COLUMN "branch_id" uuid;--> statement-breakpoint
ALTER TABLE "turn" ADD COLUMN "judge_label" text;--> statement-breakpoint
ALTER TABLE "llm_call" ADD CONSTRAINT "llm_call_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "branch_session_replay_key" ON "branch" USING btree ("session_id") WHERE "branch"."kind" = 'replay';