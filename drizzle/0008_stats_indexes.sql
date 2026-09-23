CREATE INDEX "cli_tokens_user_idx" ON "cli_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "daily_contributions_user_date_idx" ON "daily_contributions" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "daily_local_user_date_idx" ON "daily_local" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "user_tokens_user_idx" ON "user_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "weekly_stats_user_week_idx" ON "weekly_stats" USING btree ("user_id","week_start");