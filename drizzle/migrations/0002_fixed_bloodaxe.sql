CREATE TABLE "shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"share_id" text NOT NULL,
	"clerk_user_id" text NOT NULL,
	"scenario_title" text DEFAULT '' NOT NULL,
	"quote" text NOT NULL,
	"turn_count" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shares_share_id_unique" UNIQUE("share_id")
);
