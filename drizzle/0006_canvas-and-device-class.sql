ALTER TABLE "session" ADD COLUMN "canvas_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "canvas_tokens" jsonb;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "canvas_frozen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "device_class" text;