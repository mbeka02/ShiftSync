CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
CREATE TYPE "availability_exception_type" AS ENUM('unavailable', 'override');--> statement-breakpoint
CREATE TYPE "certification_status" AS ENUM('active', 'suspended', 'revoked');--> statement-breakpoint
CREATE TABLE "assignment_periods" (
	"assignment_id" uuid PRIMARY KEY,
	"staff_id" text NOT NULL,
	"work_period" tstzrange NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availability_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"staff_id" text NOT NULL,
	"exception_date" date NOT NULL,
	"type" "availability_exception_type" NOT NULL,
	"start_local_time" time,
	"end_local_time" time,
	"timezone" text NOT NULL,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "availability_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"staff_id" text NOT NULL,
	"weekday" smallint NOT NULL,
	"start_local_time" time NOT NULL,
	"end_local_time" time NOT NULL,
	"timezone" text NOT NULL,
	"valid_from" date NOT NULL,
	"valid_to" date,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "availability_rules_weekday_check" CHECK ("weekday" between 1 and 7),
	CONSTRAINT "availability_rules_dates_check" CHECK ("valid_to" is null or "valid_to" >= "valid_from")
);
--> statement-breakpoint
CREATE TABLE "staff_location_certifications" (
	"staff_id" text,
	"location_id" uuid,
	"valid_from" date,
	"valid_to" date,
	"status" "certification_status" DEFAULT 'active'::"certification_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_location_certifications_pkey" PRIMARY KEY("staff_id","location_id","valid_from"),
	CONSTRAINT "staff_certifications_dates_check" CHECK ("valid_to" is null or "valid_to" >= "valid_from")
);
--> statement-breakpoint
CREATE TABLE "staff_skills" (
	"staff_id" text,
	"skill_id" uuid,
	"valid_from" date,
	"valid_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_skills_pkey" PRIMARY KEY("staff_id","skill_id","valid_from"),
	CONSTRAINT "staff_skills_dates_check" CHECK ("valid_to" is null or "valid_to" >= "valid_from")
);
--> statement-breakpoint
CREATE INDEX "assignment_periods_staff_idx" ON "assignment_periods" ("staff_id");--> statement-breakpoint
INSERT INTO "assignment_periods" ("assignment_id", "staff_id", "work_period")
SELECT a."id", a."staff_id", tstzrange(s."starts_at", s."ends_at", '[)')
FROM "assignments" a
JOIN "shifts" s ON s."id" = a."shift_id"
WHERE a."status" = 'assigned'
ON CONFLICT ("assignment_id") DO NOTHING;--> statement-breakpoint
ALTER TABLE "assignment_periods" ADD CONSTRAINT "assignment_periods_no_staff_overlap" EXCLUDE USING gist ("staff_id" WITH =, "work_period" WITH &&);--> statement-breakpoint
CREATE INDEX "availability_exceptions_staff_date_idx" ON "availability_exceptions" ("staff_id","exception_date");--> statement-breakpoint
CREATE INDEX "availability_rules_staff_idx" ON "availability_rules" ("staff_id");--> statement-breakpoint
ALTER TABLE "assignment_periods" ADD CONSTRAINT "assignment_periods_assignment_id_assignments_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "assignment_periods" ADD CONSTRAINT "assignment_periods_staff_id_staff_profiles_user_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_profiles"("user_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "availability_exceptions" ADD CONSTRAINT "availability_exceptions_staff_id_staff_profiles_user_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_profiles"("user_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_staff_id_staff_profiles_user_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_profiles"("user_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "staff_location_certifications" ADD CONSTRAINT "staff_location_certifications_9jkKi0gjrDP9_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_profiles"("user_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "staff_location_certifications" ADD CONSTRAINT "staff_location_certifications_location_id_locations_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "staff_skills" ADD CONSTRAINT "staff_skills_staff_id_staff_profiles_user_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_profiles"("user_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "staff_skills" ADD CONSTRAINT "staff_skills_skill_id_skills_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE;
