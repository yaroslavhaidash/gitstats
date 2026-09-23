CREATE TABLE "handle_cache" (
	"login" text PRIMARY KEY NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"data" jsonb,
	"member_viewed" boolean DEFAULT false NOT NULL
);
