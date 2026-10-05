-- The walking-skeleton persona row holds no sealed items and is not a valid scenario file. It and
-- the practice sessions played on it are removed; their `llm_call` rows stay, so spend is kept.
DELETE FROM "session" WHERE "scenario_id" IN (SELECT "id" FROM "scenario" WHERE NOT ("content" ? 'items'));--> statement-breakpoint
DELETE FROM "scenario" WHERE NOT ("content" ? 'items');--> statement-breakpoint
ALTER TABLE "scenario" ADD COLUMN "origin" text DEFAULT 'authored' NOT NULL;--> statement-breakpoint
ALTER TABLE "scenario" ADD COLUMN "interim_gate" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "scenario" ADD COLUMN "display_name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "scenario" ADD COLUMN "avatar_key" text;--> statement-breakpoint
ALTER TABLE "scenario" ADD COLUMN "tagline" text NOT NULL;--> statement-breakpoint
ALTER TABLE "scenario" ADD COLUMN "language" text NOT NULL;