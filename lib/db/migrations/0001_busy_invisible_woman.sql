CREATE TABLE "case_analyses" (
	"id" serial PRIMARY KEY NOT NULL,
	"case_id" integer NOT NULL,
	"category" varchar(50),
	"summary" text,
	"intent" text,
	"urgency" varchar(20),
	"recommended_action" text,
	"draft_response" text,
	"missing_information" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence" real,
	"model" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cases" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"subject" varchar(255) NOT NULL,
	"customer_email" varchar(255),
	"category" varchar(50),
	"status" varchar(30) DEFAULT 'queued' NOT NULL,
	"customer_message" text NOT NULL,
	"conversation_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"type" varchar(30) DEFAULT 'guide' NOT NULL,
	"content" text NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"creator_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "case_analyses" ADD CONSTRAINT "case_analyses_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;