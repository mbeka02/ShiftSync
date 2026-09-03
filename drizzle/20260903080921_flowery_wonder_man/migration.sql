CREATE TABLE "time_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"assignment_id" uuid NOT NULL,
	"staff_id" text NOT NULL,
	"location_id" uuid NOT NULL,
	"clock_in_at" timestamp with time zone DEFAULT now() NOT NULL,
	"clock_out_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "time_entries_open_assignment_unique" ON "time_entries" ("assignment_id") WHERE "clock_out_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "time_entries_open_staff_unique" ON "time_entries" ("staff_id") WHERE "clock_out_at" is null;--> statement-breakpoint
CREATE INDEX "time_entries_location_open_clock_in_idx" ON "time_entries" ("location_id","clock_out_at","clock_in_at");--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_assignment_id_assignments_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_staff_id_user_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_location_id_locations_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE;