ALTER TABLE "kudos" RENAME TO "props";--> statement-breakpoint
ALTER TABLE "props" RENAME CONSTRAINT "kudos_giver_id_receiver_id_week_start_pk" TO "props_giver_id_receiver_id_week_start_pk";--> statement-breakpoint
ALTER TABLE "props" RENAME CONSTRAINT "kudos_giver_id_users_id_fk" TO "props_giver_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "props" RENAME CONSTRAINT "kudos_receiver_id_users_id_fk" TO "props_receiver_id_users_id_fk";--> statement-breakpoint
ALTER INDEX "kudos_receiver_idx" RENAME TO "props_receiver_idx";--> statement-breakpoint
UPDATE "funnel_daily" SET "step" = 'props_give' WHERE "step" = 'kudos_give';--> statement-breakpoint
UPDATE "deleted_users_archive" SET "data" = ("data" - 'kudos') || jsonb_build_object('props', "data" -> 'kudos') WHERE "data" ? 'kudos';
