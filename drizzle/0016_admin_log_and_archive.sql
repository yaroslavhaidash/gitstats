CREATE TABLE "admin_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"who" text NOT NULL,
	"action" text NOT NULL,
	"target" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deleted_users_archive" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"login" text NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"data" jsonb NOT NULL
);
