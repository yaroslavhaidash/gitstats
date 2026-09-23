CREATE TABLE "crew_members" (
	"crew_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crew_members_crew_id_user_id_pk" PRIMARY KEY("crew_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "crews" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crews_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "daily_contributions" (
	"user_id" integer NOT NULL,
	"date" date NOT NULL,
	"contribution_count" integer NOT NULL,
	CONSTRAINT "daily_contributions_user_id_date_pk" PRIMARY KEY("user_id","date")
);
--> statement-breakpoint
CREATE TABLE "repos" (
	"github_node_id" text PRIMARY KEY NOT NULL,
	"name_with_owner" text NOT NULL,
	"is_fork" boolean DEFAULT false NOT NULL,
	"primary_language" text,
	"stargazer_count" integer DEFAULT 0 NOT NULL,
	"stats_pending" boolean DEFAULT false NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "snapshot_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"users_processed" integer DEFAULT 0 NOT NULL,
	"repos_processed" integer DEFAULT 0 NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"github_login" text NOT NULL,
	"github_node_id" text NOT NULL,
	"avatar_url" text NOT NULL,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_github_login_unique" UNIQUE("github_login"),
	CONSTRAINT "users_github_node_id_unique" UNIQUE("github_node_id")
);
--> statement-breakpoint
CREATE TABLE "weekly_stats" (
	"user_id" integer NOT NULL,
	"repo_node_id" text NOT NULL,
	"week_start" date NOT NULL,
	"additions" integer NOT NULL,
	"deletions" integer NOT NULL,
	"commits" integer NOT NULL,
	CONSTRAINT "weekly_stats_user_id_repo_node_id_week_start_pk" PRIMARY KEY("user_id","repo_node_id","week_start")
);
--> statement-breakpoint
ALTER TABLE "crew_members" ADD CONSTRAINT "crew_members_crew_id_crews_id_fk" FOREIGN KEY ("crew_id") REFERENCES "public"."crews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_members" ADD CONSTRAINT "crew_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crews" ADD CONSTRAINT "crews_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_contributions" ADD CONSTRAINT "daily_contributions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_stats" ADD CONSTRAINT "weekly_stats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_stats" ADD CONSTRAINT "weekly_stats_repo_node_id_repos_github_node_id_fk" FOREIGN KEY ("repo_node_id") REFERENCES "public"."repos"("github_node_id") ON DELETE no action ON UPDATE no action;