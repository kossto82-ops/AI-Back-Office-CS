CREATE TABLE "auth_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" varchar(10) NOT NULL,
	"identifier" varchar(300) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "auth_attempts_lookup_idx" ON "auth_attempts" USING btree ("kind","identifier","created_at");