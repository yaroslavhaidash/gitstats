CREATE TABLE "kudos" (
	"giver_id" integer NOT NULL,
	"receiver_id" integer NOT NULL,
	"week_start" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kudos_giver_id_receiver_id_week_start_pk" PRIMARY KEY("giver_id","receiver_id","week_start")
);
--> statement-breakpoint
ALTER TABLE "kudos" ADD CONSTRAINT "kudos_giver_id_users_id_fk" FOREIGN KEY ("giver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kudos" ADD CONSTRAINT "kudos_receiver_id_users_id_fk" FOREIGN KEY ("receiver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kudos_receiver_idx" ON "kudos" USING btree ("receiver_id");