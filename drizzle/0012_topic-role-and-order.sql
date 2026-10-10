ALTER TABLE "topic" ADD COLUMN "role" text;--> statement-breakpoint
ALTER TABLE "topic" ADD COLUMN "display_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "role_filter" text;--> statement-breakpoint
UPDATE "topic" SET "role" = 'ux', "display_order" = 10 WHERE "id" = 'ux-chi-tieu';