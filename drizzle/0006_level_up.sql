ALTER TABLE "characters" ADD COLUMN "proficiency" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "advancements" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "marked_traits" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
UPDATE "characters" SET "proficiency" = 1 + ("level" >= 2)::int + ("level" >= 5)::int + ("level" >= 8)::int;
