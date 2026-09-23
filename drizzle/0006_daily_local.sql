CREATE TABLE "daily_local" (
	"user_id" integer NOT NULL,
	"repo_node_id" text NOT NULL,
	"date" date NOT NULL,
	"commits" integer NOT NULL,
	CONSTRAINT "daily_local_user_id_repo_node_id_date_pk" PRIMARY KEY("user_id","repo_node_id","date")
);
--> statement-breakpoint
ALTER TABLE "daily_local" ADD CONSTRAINT "daily_local_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_local" ADD CONSTRAINT "daily_local_repo_node_id_repos_github_node_id_fk" FOREIGN KEY ("repo_node_id") REFERENCES "public"."repos"("github_node_id") ON DELETE no action ON UPDATE no action;