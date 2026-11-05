CREATE TABLE "scenes" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"campaign_id" text NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"environment_id" text,
	"status" text DEFAULT 'planned' NOT NULL,
	"encounter" jsonb,
	"loot" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;