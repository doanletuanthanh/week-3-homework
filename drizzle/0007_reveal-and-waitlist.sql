CREATE TABLE "waitlist" (
	"user_id" uuid NOT NULL,
	"context" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waitlist_user_id_context_pk" PRIMARY KEY("user_id","context")
);
--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "guess" integer;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "revealed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "reveal_parts" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "reveal_json" jsonb;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "reveal_ready_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "reveal_run_token" uuid;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "reveal_run_attempt" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "reveal_heartbeat_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON "waitlist" FROM anon, authenticated;
