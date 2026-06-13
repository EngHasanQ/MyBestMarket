ALTER TABLE "prices" ADD COLUMN "is_demo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "is_demo" boolean DEFAULT false NOT NULL;