CREATE TABLE "stage_game_analysis" (
	"game_id" varchar(12) PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"evals" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stage_games" (
	"id" varchar(12) PRIMARY KEY NOT NULL,
	"owner_key" varchar(64) NOT NULL,
	"user_id" uuid,
	"site" varchar(32) DEFAULT 'manual' NOT NULL,
	"round" integer,
	"played_on" varchar(10) NOT NULL,
	"my_side" varchar(1) DEFAULT 'r' NOT NULL,
	"me" jsonb NOT NULL,
	"opponent" jsonb NOT NULL,
	"result" varchar(8),
	"result_source" varchar(16),
	"start_fen" text NOT NULL,
	"moves" jsonb NOT NULL,
	"plies" integer NOT NULL,
	"time_control" varchar(32),
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stage_game_analysis" ADD CONSTRAINT "stage_game_analysis_game_id_stage_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."stage_games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_games" ADD CONSTRAINT "stage_games_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stage_game_analysis_version_idx" ON "stage_game_analysis" USING btree ("version");--> statement-breakpoint
CREATE INDEX "stage_games_owner_ended_idx" ON "stage_games" USING btree ("owner_key","ended_at");--> statement-breakpoint
CREATE INDEX "stage_games_user_ended_idx" ON "stage_games" USING btree ("user_id","ended_at");--> statement-breakpoint
CREATE INDEX "stage_games_played_on_idx" ON "stage_games" USING btree ("owner_key","played_on");