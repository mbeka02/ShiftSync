CREATE TYPE "profile_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "assignment_status" AS ENUM('assigned', 'removed', 'cancelled');--> statement-breakpoint
CREATE TYPE "schedule_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "shift_status" AS ENUM('active', 'cancelled');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"issuer" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL UNIQUE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"code" text NOT NULL UNIQUE,
	"name" text NOT NULL,
	CONSTRAINT "roles_code_check" CHECK ("code" in ('admin', 'manager', 'staff'))
);
--> statement-breakpoint
CREATE TABLE "staff_profiles" (
	"user_id" text PRIMARY KEY,
	"desired_weekly_hours" numeric(5,2) DEFAULT '0' NOT NULL,
	"primary_timezone" text NOT NULL,
	"employment_start_date" date NOT NULL,
	"employment_end_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_employment_dates_check" CHECK ("employment_end_date" is null or "employment_end_date" >= "employment_start_date")
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"user_id" text PRIMARY KEY,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"phone" text,
	"status" "profile_status" DEFAULT 'active'::"profile_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" text,
	"role_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_pkey" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"shift_id" uuid NOT NULL,
	"staff_id" text NOT NULL,
	"status" "assignment_status" DEFAULT 'assigned'::"assignment_status" NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assigned_by" text NOT NULL,
	"removed_at" timestamp with time zone,
	"removed_by" text,
	"manager_override" boolean DEFAULT false NOT NULL,
	"override_reason" text,
	"risk_flags" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignments_override_reason_check" CHECK (not "manager_override" or "override_reason" is not null)
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL UNIQUE,
	"timezone" text NOT NULL,
	"scheduling_cutoff_minutes" integer DEFAULT 2880 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "locations_cutoff_nonnegative_check" CHECK ("scheduling_cutoff_minutes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "manager_locations" (
	"manager_user_id" text,
	"location_id" uuid,
	"valid_from" date,
	"valid_to" date,
	CONSTRAINT "manager_locations_pkey" PRIMARY KEY("manager_user_id","location_id","valid_from"),
	CONSTRAINT "manager_location_dates_check" CHECK ("valid_to" is null or "valid_to" >= "valid_from")
);
--> statement-breakpoint
CREATE TABLE "schedule_weeks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"location_id" uuid NOT NULL,
	"week_start_date" date NOT NULL,
	"status" "schedule_status" DEFAULT 'draft'::"schedule_status" NOT NULL,
	"published_at" timestamp with time zone,
	"published_by" text,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"schedule_week_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"required_skill_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"timezone" text NOT NULL,
	"local_start_date" date NOT NULL,
	"local_start_time" time NOT NULL,
	"local_end_date" date NOT NULL,
	"local_end_time" time NOT NULL,
	"headcount" integer DEFAULT 1 NOT NULL,
	"premium" boolean DEFAULT false NOT NULL,
	"status" "shift_status" DEFAULT 'active'::"shift_status" NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "shifts_time_order_check" CHECK ("ends_at" > "starts_at"),
	CONSTRAINT "shifts_headcount_positive_check" CHECK ("headcount" >= 1)
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"code" text NOT NULL UNIQUE,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_issuer_account_id_unique" ON "account" ("issuer","account_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "user_roles_user_role_unique" ON "user_roles" ("user_id","role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assignments_active_shift_staff_unique" ON "assignments" ("shift_id","staff_id") WHERE "status" = 'assigned';--> statement-breakpoint
CREATE INDEX "assignments_staff_idx" ON "assignments" ("staff_id");--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_weeks_location_week_unique" ON "schedule_weeks" ("location_id","week_start_date");--> statement-breakpoint
CREATE INDEX "schedule_weeks_status_idx" ON "schedule_weeks" ("status");--> statement-breakpoint
CREATE INDEX "shifts_week_idx" ON "shifts" ("schedule_week_id");--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_shift_id_shifts_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_staff_id_staff_profiles_user_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_profiles"("user_id");--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_assigned_by_user_id_fkey" FOREIGN KEY ("assigned_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_removed_by_user_id_fkey" FOREIGN KEY ("removed_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "manager_locations" ADD CONSTRAINT "manager_locations_manager_user_id_user_id_fkey" FOREIGN KEY ("manager_user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "manager_locations" ADD CONSTRAINT "manager_locations_location_id_locations_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "schedule_weeks" ADD CONSTRAINT "schedule_weeks_location_id_locations_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "schedule_weeks" ADD CONSTRAINT "schedule_weeks_published_by_user_id_fkey" FOREIGN KEY ("published_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_schedule_week_id_schedule_weeks_id_fkey" FOREIGN KEY ("schedule_week_id") REFERENCES "schedule_weeks"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_location_id_locations_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id");--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_required_skill_id_skills_id_fkey" FOREIGN KEY ("required_skill_id") REFERENCES "skills"("id");--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id");