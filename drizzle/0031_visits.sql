CREATE EXTENSION IF NOT EXISTS citext;--> statement-breakpoint
CREATE TABLE "leads" (
	"login" "citext" PRIMARY KEY NOT NULL,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"visits" integer DEFAULT 1 NOT NULL,
	"first_referrer" text,
	"first_landing" text,
	"furthest_step" smallint DEFAULT 0 NOT NULL,
	"became_member_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "looked_up_handles" (
	"login" "citext" PRIMARY KEY NOT NULL,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"lookups" integer DEFAULT 1 NOT NULL,
	"by_leads" "citext"[] DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visit_events" (
	"visitor_id" text NOT NULL,
	"day" date NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"path" text NOT NULL,
	"kind" text NOT NULL,
	"from" text
);
--> statement-breakpoint
CREATE TABLE "visit_salts" (
	"day" date PRIMARY KEY NOT NULL,
	"salt" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visits" (
	"visitor_id" text NOT NULL,
	"day" date NOT NULL,
	"first_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_at" timestamp with time zone DEFAULT now() NOT NULL,
	"landing_path" text NOT NULL,
	"referrer" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"country" text,
	"device" text NOT NULL,
	"furthest_step" smallint DEFAULT 0 NOT NULL,
	"lead_login" "citext",
	"user_id" integer,
	CONSTRAINT "visits_visitor_id_day_pk" PRIMARY KEY("visitor_id","day")
);
--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "visit_events_visit_idx" ON "visit_events" USING btree ("visitor_id","day");--> statement-breakpoint
CREATE INDEX "visits_day_idx" ON "visits" USING btree ("day");