CREATE TABLE "case_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"case_id" integer NOT NULL,
	"user_id" integer,
	"type" varchar(40) NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "case_events" ADD CONSTRAINT "case_events_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_events" ADD CONSTRAINT "case_events_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_events" ADD CONSTRAINT "case_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "case_events_case_created_idx" ON "case_events" USING btree ("case_id","created_at");--> statement-breakpoint
CREATE INDEX "case_events_team_type_created_idx" ON "case_events" USING btree ("team_id","type","created_at");--> statement-breakpoint
CREATE INDEX "case_analyses_case_created_idx" ON "case_analyses" USING btree ("case_id","created_at");--> statement-breakpoint
CREATE INDEX "cases_team_created_idx" ON "cases" USING btree ("team_id","created_at");--> statement-breakpoint
CREATE INDEX "documents_team_status_idx" ON "documents" USING btree ("team_id","status");