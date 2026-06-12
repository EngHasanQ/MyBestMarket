CREATE TYPE "public"."evidence_type" AS ENUM('product_image', 'page_screenshot', 'flyer_crop', 'receipt');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('active', 'auto_created', 'merged');--> statement-breakpoint
CREATE TABLE "category_mappings" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"store_category_path" text NOT NULL,
	"category_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_evidence" (
	"id" serial PRIMARY KEY NOT NULL,
	"price_id" integer NOT NULL,
	"evidence_type" "evidence_type" NOT NULL,
	"image_path" text,
	"source_url" text,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"query" text NOT NULL,
	"city_id" integer,
	"status" "review_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_synonyms" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_key" text NOT NULL,
	"term" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "status" "product_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "merged_into" integer;--> statement-breakpoint
ALTER TABLE "category_mappings" ADD CONSTRAINT "category_mappings_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_mappings" ADD CONSTRAINT "category_mappings_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_evidence" ADD CONSTRAINT "price_evidence_price_id_prices_id_fk" FOREIGN KEY ("price_id") REFERENCES "public"."prices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_requests" ADD CONSTRAINT "product_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_requests" ADD CONSTRAINT "product_requests_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "catmap_store_path_uq" ON "category_mappings" USING btree ("store_id","store_category_path");--> statement-breakpoint
CREATE INDEX "evidence_price_idx" ON "price_evidence" USING btree ("price_id");--> statement-breakpoint
CREATE UNIQUE INDEX "synonym_term_uq" ON "search_synonyms" USING btree ("term");--> statement-breakpoint
CREATE INDEX "synonym_group_idx" ON "search_synonyms" USING btree ("group_key");