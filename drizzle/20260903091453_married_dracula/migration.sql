CREATE TYPE "notification_mode" AS ENUM('in_app_only', 'in_app_and_email');--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"user_id" text PRIMARY KEY,
	"notification_mode" "notification_mode" DEFAULT 'in_app_only'::"notification_mode" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_compensation" (
	"staff_id" text,
	"hourly_rate" numeric(10,2) NOT NULL,
	"overtime_multiplier" numeric(5,2) DEFAULT '1.5' NOT NULL,
	"effective_from" date,
	"effective_to" date,
	CONSTRAINT "staff_compensation_pkey" PRIMARY KEY("staff_id","effective_from"),
	CONSTRAINT "staff_compensation_rate_positive_check" CHECK ("hourly_rate" >= 0),
	CONSTRAINT "staff_compensation_multiplier_check" CHECK ("overtime_multiplier" >= 1),
	CONSTRAINT "staff_compensation_dates_check" CHECK ("effective_to" is null or "effective_to" >= "effective_from")
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "location_id" uuid;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "request_id" uuid;--> statement-breakpoint
CREATE INDEX "audit_logs_location_created_idx" ON "audit_logs" ("location_id","created_at");--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "staff_compensation" ADD CONSTRAINT "staff_compensation_staff_id_staff_profiles_user_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_profiles"("user_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_location_id_locations_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id");