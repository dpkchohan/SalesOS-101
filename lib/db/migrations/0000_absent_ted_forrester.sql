CREATE TABLE IF NOT EXISTS "organizations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "name" text NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "clerk_user_id" text,
        "org_id" uuid NOT NULL,
        "email" text NOT NULL,
        "name" text NOT NULL,
        "role" text DEFAULT 'rep' NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "users_clerk_user_id_unique" UNIQUE("clerk_user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "companies" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "org_id" uuid NOT NULL,
        "name" text NOT NULL,
        "website" text,
        "industry" text,
        "size" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contacts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "org_id" uuid NOT NULL,
        "company_id" uuid,
        "customer_no" text,
        "name" text NOT NULL,
        "email" text,
        "email_normalized" text,
        "phone" text,
        "phone_normalized" text,
        "title" text,
        "linkedin_url" text,
        "tags" text[] DEFAULT '{}' NOT NULL,
        "import_job_id" uuid,
        "is_duplicate" boolean DEFAULT false NOT NULL,
        "duplicate_of" uuid,
        "merged_at" timestamp with time zone,
        "merged_reason" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "org_contact_counters" (
        "org_id" uuid PRIMARY KEY NOT NULL,
        "last_no" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leads" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "org_id" uuid NOT NULL,
        "contact_id" uuid NOT NULL,
        "assigned_to" uuid,
        "stage" text DEFAULT 'new' NOT NULL,
        "value_usd" integer,
        "currency" text DEFAULT 'USD' NOT NULL,
        "close_date" date,
        "source" text,
        "import_job_id" uuid,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "interactions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "org_id" uuid NOT NULL,
        "lead_id" uuid NOT NULL,
        "created_by" uuid,
        "type" text NOT NULL,
        "date" date NOT NULL,
        "time" text,
        "gist" text NOT NULL,
        "gains" text[] DEFAULT '{}' NOT NULL,
        "misses" text[] DEFAULT '{}' NOT NULL,
        "action_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
        "next_step" text,
        "duration_minutes" integer,
        "sentiment" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tasks" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "org_id" uuid NOT NULL,
        "lead_id" uuid,
        "assigned_to" uuid,
        "title" text NOT NULL,
        "description" text,
        "due_date" date,
        "due_time" text,
        "completed_at" timestamp with time zone,
        "priority" text DEFAULT 'medium' NOT NULL,
        "calendar_event_id" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_signals" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "org_id" uuid NOT NULL,
        "lead_id" uuid NOT NULL,
        "signal_type" text NOT NULL,
        "severity" text DEFAULT 'medium' NOT NULL,
        "message" text NOT NULL,
        "recommendation" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documents" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "org_id" uuid NOT NULL,
        "lead_id" uuid NOT NULL,
        "type" text NOT NULL,
        "title" text NOT NULL,
        "content" text,
        "format" text DEFAULT 'html' NOT NULL,
        "status" text DEFAULT 'draft' NOT NULL,
        "sent_at" timestamp with time zone,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "company_credentials" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "org_id" uuid NOT NULL,
        "company_name" text,
        "company_logo_url" text,
        "primary_color" text DEFAULT '#F94D00',
        "secondary_color" text DEFAULT '#7C3AED',
        "accent_color" text DEFAULT '#06B6D4',
        "footer_text" text,
        "website" text,
        "phone" text,
        "email" text,
        "address" text,
        "tax_id" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "company_credentials_org_unique" UNIQUE("org_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "import_jobs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "org_id" uuid NOT NULL,
        "created_by" uuid,
        "filename" text NOT NULL,
        "file_size" integer DEFAULT 0 NOT NULL,
        "file_path" text,
        "status" text DEFAULT 'preview' NOT NULL,
        "total_rows" integer DEFAULT 0 NOT NULL,
        "processed_rows" integer DEFAULT 0 NOT NULL,
        "contacts_created" integer DEFAULT 0 NOT NULL,
        "contacts_updated" integer DEFAULT 0 NOT NULL,
        "leads_created" integer DEFAULT 0 NOT NULL,
        "companies_created" integer DEFAULT 0 NOT NULL,
        "skipped" integer DEFAULT 0 NOT NULL,
        "total_batches" integer DEFAULT 0 NOT NULL,
        "completed_batches" integer DEFAULT 0 NOT NULL,
        "preview" jsonb,
        "batch_results" jsonb DEFAULT '[]'::jsonb NOT NULL,
        "error_log" jsonb DEFAULT '[]'::jsonb NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
        "completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_attachments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "org_id" uuid NOT NULL,
        "uploaded_by" uuid,
        "file_name" text NOT NULL,
        "file_type" text NOT NULL,
        "mime_type" text NOT NULL,
        "file_size" integer DEFAULT 0 NOT NULL,
        "storage_key" text NOT NULL,
        "extraction_status" text DEFAULT 'pending' NOT NULL,
        "extracted_data" jsonb,
        "error" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "feedback" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "org_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "type" text NOT NULL,
        "criticality" integer DEFAULT 3 NOT NULL,
        "description" text NOT NULL,
        "screenshot_url" text,
        "page_url" text NOT NULL,
        "status" text DEFAULT 'open' NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "errors" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "org_id" uuid,
        "user_id" uuid,
        "message" text NOT NULL,
        "stack" text,
        "page_url" text NOT NULL,
        "user_agent" text,
        "status" text DEFAULT 'new' NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "storage_usage" (
        "user_id" uuid PRIMARY KEY NOT NULL,
        "org_id" uuid,
        "tier" text DEFAULT 'free' NOT NULL,
        "used_bytes" bigint DEFAULT 0 NOT NULL,
        "quota_bytes" bigint DEFAULT 262144000 NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "companies" ADD CONSTRAINT "companies_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contacts" ADD CONSTRAINT "contacts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contacts" ADD CONSTRAINT "contacts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contacts" ADD CONSTRAINT "contacts_duplicate_of_contacts_id_fk" FOREIGN KEY ("duplicate_of") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "org_contact_counters" ADD CONSTRAINT "org_contact_counters_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leads" ADD CONSTRAINT "leads_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leads" ADD CONSTRAINT "leads_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "interactions" ADD CONSTRAINT "interactions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "interactions" ADD CONSTRAINT "interactions_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "interactions" ADD CONSTRAINT "interactions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_signals" ADD CONSTRAINT "ai_signals_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_signals" ADD CONSTRAINT "ai_signals_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_credentials" ADD CONSTRAINT "company_credentials_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat_attachments" ADD CONSTRAINT "chat_attachments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat_attachments" ADD CONSTRAINT "chat_attachments_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "feedback" ADD CONSTRAINT "feedback_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "errors" ADD CONSTRAINT "errors_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "errors" ADD CONSTRAINT "errors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "storage_usage" ADD CONSTRAINT "storage_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "storage_usage" ADD CONSTRAINT "storage_usage_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_org_idx" ON "users" USING btree ("org_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_email_idx" ON "users" USING btree ("email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "companies_org_idx" ON "companies" USING btree ("org_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_org_idx" ON "contacts" USING btree ("org_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_email_idx" ON "contacts" USING btree ("email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_company_idx" ON "contacts" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_duplicate_of_idx" ON "contacts" USING btree ("duplicate_of");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "contacts_org_email_unique" ON "contacts" USING btree ("org_id" uuid_ops,lower("email") text_ops) WHERE "contacts"."email" is not null and "contacts"."is_duplicate" = false;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "contacts_org_phone_unique" ON "contacts" USING btree ("org_id" uuid_ops,"phone_normalized" text_ops) WHERE "contacts"."phone_normalized" is not null and "contacts"."is_duplicate" = false;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "contacts_org_customer_no_unique" ON "contacts" USING btree ("org_id" uuid_ops,"customer_no" text_ops) WHERE "contacts"."customer_no" is not null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_org_idx" ON "leads" USING btree ("org_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_stage_idx" ON "leads" USING btree ("stage");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_contact_idx" ON "leads" USING btree ("contact_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interactions_org_idx" ON "interactions" USING btree ("org_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interactions_lead_idx" ON "interactions" USING btree ("lead_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_org_idx" ON "tasks" USING btree ("org_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_due_idx" ON "tasks" USING btree ("due_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_lead_idx" ON "tasks" USING btree ("lead_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "signals_org_idx" ON "ai_signals" USING btree ("org_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "signals_lead_idx" ON "ai_signals" USING btree ("lead_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_org_idx" ON "documents" USING btree ("org_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_lead_idx" ON "documents" USING btree ("lead_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "import_jobs_org_idx" ON "import_jobs" USING btree ("org_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "import_jobs_status_idx" ON "import_jobs" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_attachments_org_idx" ON "chat_attachments" USING btree ("org_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_attachments_status_idx" ON "chat_attachments" USING btree ("extraction_status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_org_idx" ON "feedback" USING btree ("org_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_user_idx" ON "feedback" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_status_idx" ON "feedback" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "errors_org_idx" ON "errors" USING btree ("org_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "errors_user_idx" ON "errors" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "errors_created_idx" ON "errors" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "storage_usage_user_idx" ON "storage_usage" USING btree ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "storage_usage_org_uniq" ON "storage_usage" USING btree ("org_id");
