CREATE TABLE "eval_tool_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"result_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "eval_tool_cache" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON "eval_tool_cache" FROM anon, authenticated;
