CREATE TABLE "funnel_daily" (
	"day" date NOT NULL,
	"step" text NOT NULL,
	"n" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "funnel_daily_day_step_pk" PRIMARY KEY("day","step")
);
