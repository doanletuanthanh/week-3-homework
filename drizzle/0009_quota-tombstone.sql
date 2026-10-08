CREATE TABLE "quota_tombstone" (
	"key" text PRIMARY KEY NOT NULL,
	"played_persona_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quota_tombstone" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON "quota_tombstone" FROM anon, authenticated;
