CREATE TABLE "games" (
	"id" varchar(12) PRIMARY KEY NOT NULL,
	"red_id" uuid NOT NULL,
	"black_id" uuid NOT NULL,
	"minutes" integer NOT NULL,
	"rated" boolean DEFAULT true NOT NULL,
	"winner" varchar(1),
	"reason" varchar(20) NOT NULL,
	"moves" jsonb NOT NULL,
	"plies" integer NOT NULL,
	"red_rating_before" integer NOT NULL,
	"black_rating_before" integer NOT NULL,
	"red_rating_after" integer NOT NULL,
	"black_rating_after" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar(20) NOT NULL,
	"display_name" varchar(32) NOT NULL,
	"password_hash" text NOT NULL,
	"rating" integer DEFAULT 1500 NOT NULL,
	"peak_rating" integer DEFAULT 1500 NOT NULL,
	"games_played" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"draws" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_red_id_users_id_fk" FOREIGN KEY ("red_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_black_id_users_id_fk" FOREIGN KEY ("black_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "games_red_idx" ON "games" USING btree ("red_id","ended_at");--> statement-breakpoint
CREATE INDEX "games_black_idx" ON "games" USING btree ("black_id","ended_at");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "users_rating_idx" ON "users" USING btree ("rating");