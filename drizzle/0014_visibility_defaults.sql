ALTER TABLE "users" ALTER COLUMN "profile_visibility" SET DEFAULT 'everyone';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "share_private_global" SET DEFAULT true;--> statement-breakpoint
UPDATE "users" SET
  "profile_visibility" = 'everyone',
  "share_private" = true,
  "share_private_global" = true,
  "repo_names" = 'public_only',
  "repo_names_global" = 'none';
