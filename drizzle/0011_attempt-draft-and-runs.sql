ALTER TABLE "generation_attempt" ADD COLUMN "draft" jsonb;--> statement-breakpoint
ALTER TABLE "generation_attempt" ADD COLUMN "run_attempt" integer DEFAULT 0 NOT NULL;