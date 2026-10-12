CREATE TABLE "analysis_usage" (
	"key" varchar(80) PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_analysis" (
	"game_id" varchar(12) PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"evals" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game_analysis" ADD CONSTRAINT "game_analysis_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_analysis_version_idx" ON "game_analysis" USING btree ("version");