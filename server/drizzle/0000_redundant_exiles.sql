CREATE TYPE "public"."job_status" AS ENUM('running', 'success', 'failed');--> statement-breakpoint
CREATE TYPE "public"."list_status" AS ENUM('draft', 'active', 'completed');--> statement-breakpoint
CREATE TYPE "public"."place_status" AS ENUM('pending', 'active', 'excluded_no_source', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."price_basis" AS ENUM('shelf', 'online', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."price_source" AS ENUM('api', 'scrape', 'flyer_ocr_verified', 'user_report', 'receipt_ocr', 'manual_admin');--> statement-breakpoint
CREATE TYPE "public"."review_kind" AS ENUM('flyer', 'anomaly');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('api', 'web_catalog', 'flyer', 'user_only');--> statement-breakpoint
CREATE TYPE "public"."store_type" AS ENUM('supermarket', 'grocery', 'specialty');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"parent_id" integer,
	"name_ar" text NOT NULL,
	"slug" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"icon" text,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "chain_calibrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"factor" double precision DEFAULT 1 NOT NULL,
	"sample_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chain_calibrations_store_id_unique" UNIQUE("store_id")
);
--> statement-breakpoint
CREATE TABLE "cities" (
	"id" serial PRIMARY KEY NOT NULL,
	"name_ar" text NOT NULL,
	"code" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"min_lat" double precision,
	"min_lng" double precision,
	"max_lat" double precision,
	"max_lng" double precision,
	CONSTRAINT "cities_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "discovered_places" (
	"place_id" text PRIMARY KEY NOT NULL,
	"city_id" integer NOT NULL,
	"name" text NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"types" jsonb,
	"website" text,
	"phone" text,
	"rating" double precision,
	"user_ratings_total" integer,
	"raw" jsonb,
	"chain_store_id" integer,
	"status" "place_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"job" text NOT NULL,
	"status" "job_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"items_in" integer DEFAULT 0 NOT NULL,
	"items_out" integer DEFAULT 0 NOT NULL,
	"errors" integer DEFAULT 0 NOT NULL,
	"detail" jsonb
);
--> statement-breakpoint
CREATE TABLE "kpi_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"day" text NOT NULL,
	"city_id" integer,
	"store_id" integer,
	"displayed_prices" integer DEFAULT 0 NOT NULL,
	"fresh_verified" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "list_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"list_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"quantity" numeric(10, 2) DEFAULT '1' NOT NULL,
	"chosen_branch_id" integer,
	"expected_price" numeric(10, 2),
	"actual_price" numeric(10, 2),
	"is_purchased" boolean DEFAULT false NOT NULL,
	"purchased_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"payload" jsonb,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offers_review_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"branch_id" integer NOT NULL,
	"kind" "review_kind" DEFAULT 'flyer' NOT NULL,
	"raw_text" text NOT NULL,
	"parsed_product_name" text,
	"parsed_price" numeric(10, 2),
	"matched_product_id" integer,
	"flyer_image_url" text,
	"offer_ends_at" timestamp with time zone,
	"status" "review_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"target_price" numeric(10, 2)
);
--> statement-breakpoint
CREATE TABLE "prices" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"branch_id" integer NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"currency" text DEFAULT 'SAR' NOT NULL,
	"is_offer" boolean DEFAULT false NOT NULL,
	"offer_ends_at" timestamp with time zone,
	"source" "price_source" NOT NULL,
	"basis" "price_basis" DEFAULT 'shelf' NOT NULL,
	"confidence" integer NOT NULL,
	"reported_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_verified_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_aliases" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"store_id" integer NOT NULL,
	"raw_name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"name_ar" text NOT NULL,
	"normalized_name" text NOT NULL,
	"brand" text,
	"size_value" numeric(10, 3),
	"size_unit" text,
	"barcode" text,
	"category_id" integer NOT NULL,
	"image_url" text
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"branch_id" integer,
	"quantity" numeric(10, 2) DEFAULT '1' NOT NULL,
	"price" numeric(10, 2),
	"purchased_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopping_lists" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"month" text NOT NULL,
	"status" "list_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_branches" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"city_id" integer NOT NULL,
	"name_ar" text NOT NULL,
	"address" text,
	"lat" double precision,
	"lng" double precision,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_source_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"source_type" "source_type" NOT NULL,
	"endpoint_or_url" text,
	"platform_hint" text,
	"price_basis" "price_basis" DEFAULT 'unknown' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"is_confirmed" boolean DEFAULT false NOT NULL,
	"last_success_at" timestamp with time zone,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"learned_publish_weekday" integer,
	"last_content_hash" text
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" serial PRIMARY KEY NOT NULL,
	"name_ar" text NOT NULL,
	"slug" text NOT NULL,
	"logo_url" text,
	"type" "store_type" DEFAULT 'supermarket' NOT NULL,
	CONSTRAINT "stores_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"city_id" integer,
	"shopping_day" integer DEFAULT 4 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "chain_calibrations" ADD CONSTRAINT "chain_calibrations_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovered_places" ADD CONSTRAINT "discovered_places_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovered_places" ADD CONSTRAINT "discovered_places_chain_store_id_stores_id_fk" FOREIGN KEY ("chain_store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_snapshots" ADD CONSTRAINT "kpi_snapshots_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_snapshots" ADD CONSTRAINT "kpi_snapshots_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_items" ADD CONSTRAINT "list_items_list_id_shopping_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."shopping_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_items" ADD CONSTRAINT "list_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_items" ADD CONSTRAINT "list_items_chosen_branch_id_store_branches_id_fk" FOREIGN KEY ("chosen_branch_id") REFERENCES "public"."store_branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers_review_queue" ADD CONSTRAINT "offers_review_queue_branch_id_store_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."store_branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers_review_queue" ADD CONSTRAINT "offers_review_queue_matched_product_id_products_id_fk" FOREIGN KEY ("matched_product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers_review_queue" ADD CONSTRAINT "offers_review_queue_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_alerts" ADD CONSTRAINT "price_alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_alerts" ADD CONSTRAINT "price_alerts_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_branch_id_store_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."store_branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_reported_by_users_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_aliases" ADD CONSTRAINT "product_aliases_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_aliases" ADD CONSTRAINT "product_aliases_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_branch_id_store_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."store_branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_lists" ADD CONSTRAINT "shopping_lists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_branches" ADD CONSTRAINT "store_branches_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_branches" ADD CONSTRAINT "store_branches_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_source_profiles" ADD CONSTRAINT "store_source_profiles_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_runs_job_idx" ON "job_runs" USING btree ("job","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "alert_user_product_uq" ON "price_alerts" USING btree ("user_id","product_id");--> statement-breakpoint
CREATE INDEX "prices_product_branch_idx" ON "prices" USING btree ("product_id","branch_id","created_at");--> statement-breakpoint
CREATE INDEX "prices_branch_idx" ON "prices" USING btree ("branch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "alias_store_raw_uq" ON "product_aliases" USING btree ("store_id","raw_name");--> statement-breakpoint
CREATE INDEX "products_normalized_idx" ON "products" USING btree ("normalized_name");--> statement-breakpoint
CREATE INDEX "purchases_user_product_idx" ON "purchases" USING btree ("user_id","product_id","purchased_at");--> statement-breakpoint
CREATE INDEX "branches_city_idx" ON "store_branches" USING btree ("city_id");