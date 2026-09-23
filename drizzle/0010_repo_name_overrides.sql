CREATE TABLE "repo_name_overrides" (
	"user_id" integer NOT NULL,
	"repo_node_id" text NOT NULL,
	"hidden" boolean DEFAULT true NOT NULL,
	CONSTRAINT "repo_name_overrides_user_id_repo_node_id_pk" PRIMARY KEY("user_id","repo_node_id")
);
--> statement-breakpoint
ALTER TABLE "repo_name_overrides" ADD CONSTRAINT "repo_name_overrides_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo_name_overrides" ADD CONSTRAINT "repo_name_overrides_repo_node_id_repos_github_node_id_fk" FOREIGN KEY ("repo_node_id") REFERENCES "public"."repos"("github_node_id") ON DELETE no action ON UPDATE no action;