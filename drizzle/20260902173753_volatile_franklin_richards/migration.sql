CREATE TYPE "coverage_request_status" AS ENUM('open', 'pending_target', 'accepted_by_target', 'claimed', 'approved', 'cancelled', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "coverage_request_type" AS ENUM('swap', 'drop');--> statement-breakpoint
CREATE TABLE "coverage_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"shift_id" uuid NOT NULL,
	"requester_staff_id" text NOT NULL,
	"target_staff_id" text,
	"claimant_staff_id" text,
	"type" "coverage_request_type" NOT NULL,
	"status" "coverage_request_status" NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"approved_by" text,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"version" bigint DEFAULT 1 NOT NULL,
	CONSTRAINT "coverage_requests_participants_check" CHECK (
    ("type" = 'swap' and "target_staff_id" is not null and "claimant_staff_id" is null)
    or ("type" = 'drop' and "target_staff_id" is null)
  )
);
--> statement-breakpoint
CREATE INDEX "coverage_requests_shift_status_idx" ON "coverage_requests" ("shift_id","status");--> statement-breakpoint
CREATE INDEX "coverage_requests_requester_status_idx" ON "coverage_requests" ("requester_staff_id","status");--> statement-breakpoint
CREATE INDEX "coverage_requests_target_status_idx" ON "coverage_requests" ("target_staff_id","status");--> statement-breakpoint
CREATE INDEX "coverage_requests_claimant_status_idx" ON "coverage_requests" ("claimant_staff_id","status");--> statement-breakpoint
ALTER TABLE "coverage_requests" ADD CONSTRAINT "coverage_requests_shift_id_shifts_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "coverage_requests" ADD CONSTRAINT "coverage_requests_ttFRbLhUwv4f_fkey" FOREIGN KEY ("requester_staff_id") REFERENCES "staff_profiles"("user_id");--> statement-breakpoint
ALTER TABLE "coverage_requests" ADD CONSTRAINT "coverage_requests_target_staff_id_staff_profiles_user_id_fkey" FOREIGN KEY ("target_staff_id") REFERENCES "staff_profiles"("user_id");--> statement-breakpoint
ALTER TABLE "coverage_requests" ADD CONSTRAINT "coverage_requests_claimant_staff_id_staff_profiles_user_id_fkey" FOREIGN KEY ("claimant_staff_id") REFERENCES "staff_profiles"("user_id");--> statement-breakpoint
ALTER TABLE "coverage_requests" ADD CONSTRAINT "coverage_requests_approved_by_user_id_fkey" FOREIGN KEY ("approved_by") REFERENCES "user"("id");