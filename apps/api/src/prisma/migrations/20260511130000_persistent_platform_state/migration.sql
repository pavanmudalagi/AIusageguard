ALTER TYPE "AssignmentType" ADD VALUE IF NOT EXISTS 'genai_app';

CREATE TYPE "AlertSeverity" AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE "AlertStatus" AS ENUM ('open', 'investigating', 'resolved', 'dismissed');
CREATE TYPE "TemplateType" AS ENUM ('email', 'education_blog', 'user_coaching', 'notification');
CREATE TYPE "TemplateStatus" AS ENUM ('draft', 'published', 'archived');

ALTER TABLE "User"
  ADD COLUMN "themePreference" TEXT NOT NULL DEFAULT 'system',
  ADD COLUMN "notificationPreferences" JSONB,
  ADD COLUMN "dashboardPreferences" JSONB,
  ADD COLUMN "lastLoginAt" TIMESTAMP(3);

ALTER TABLE "Endpoint"
  ADD COLUMN "machineName" TEXT,
  ADD COLUMN "browser" TEXT,
  ADD COLUMN "browserVersion" TEXT,
  ADD COLUMN "latestPluginVersion" TEXT,
  ADD COLUMN "pluginUpdateStatus" TEXT;

UPDATE "Endpoint" SET "machineName" = "hostname" WHERE "machineName" IS NULL;

ALTER TABLE "EndpointUser"
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "GenAIApplication"
  ADD COLUMN "organizationId" TEXT,
  ADD COLUMN "firstSeenAt" TIMESTAMP(3),
  ADD COLUMN "lastSeenAt" TIMESTAMP(3);

ALTER TABLE "Policy"
  ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN "parentPolicyId" TEXT;

UPDATE "Policy"
SET "mode" = COALESCE(("policyJson"->>'mode'), "mode");

ALTER TABLE "PolicyAssignment"
  ADD COLUMN "targetId" TEXT,
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "PolicyAssignment" SET "targetId" = "assignmentTargetId" WHERE "targetId" IS NULL;

ALTER TABLE "PolicyDelivery"
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "EducationRecommendation"
  ADD COLUMN "templateId" TEXT,
  ADD COLUMN "triggerReason" TEXT NOT NULL DEFAULT 'repeated_risky_usage',
  ADD COLUMN "assignedAt" TIMESTAMP(3),
  ADD COLUMN "acknowledgedAt" TIMESTAMP(3),
  ADD COLUMN "repeatedAfterTraining" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "OrganizationSettings" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "defaultPolicyId" TEXT,
  "uiTheme" TEXT NOT NULL DEFAULT 'system',
  "dataRetentionDays" INTEGER NOT NULL DEFAULT 90,
  "eventRetentionDays" INTEGER NOT NULL DEFAULT 90,
  "alertRetentionDays" INTEGER NOT NULL DEFAULT 180,
  "auditLogRetentionDays" INTEGER NOT NULL DEFAULT 365,
  "reportCleanPromptScans" BOOLEAN NOT NULL DEFAULT false,
  "reportSensitiveEvents" BOOLEAN NOT NULL DEFAULT true,
  "notificationSettings" JSONB,
  "smtpEnabled" BOOLEAN NOT NULL DEFAULT false,
  "smtpHostEncrypted" TEXT,
  "smtpPort" INTEGER,
  "smtpUserEncrypted" TEXT,
  "smtpPasswordEncrypted" TEXT,
  "webhookEnabled" BOOLEAN NOT NULL DEFAULT false,
  "webhookUrlEncrypted" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Alert" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "severity" "AlertSeverity" NOT NULL,
  "status" "AlertStatus" NOT NULL DEFAULT 'open',
  "sourceEventId" TEXT,
  "endpointId" TEXT,
  "genAIAppName" TEXT,
  "detectedCategories" TEXT[],
  "assignedToUserId" TEXT,
  "resolvedByUserId" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "resolutionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AlertComment" (
  "id" TEXT NOT NULL,
  "alertId" TEXT NOT NULL,
  "userId" TEXT,
  "comment" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AlertComment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailTemplate" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "TemplateType" NOT NULL,
  "category" TEXT,
  "subject" TEXT,
  "body" TEXT NOT NULL,
  "variables" TEXT[],
  "status" "TemplateStatus" NOT NULL DEFAULT 'draft',
  "version" TEXT NOT NULL DEFAULT '1.0',
  "createdByUserId" TEXT,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BrowserPluginDownload" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT,
  "pluginVersionId" TEXT,
  "version" TEXT NOT NULL,
  "targetBrowser" "TargetBrowser" NOT NULL,
  "packageChecksum" TEXT,
  "downloadedByUserId" TEXT,
  "downloadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB,
  CONSTRAINT "BrowserPluginDownload_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AppSetting" (
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "updatedBy" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

CREATE UNIQUE INDEX "OrganizationSettings_organizationId_key" ON "OrganizationSettings"("organizationId");
CREATE UNIQUE INDEX "EmailTemplate_organizationId_name_version_key" ON "EmailTemplate"("organizationId", "name", "version");

CREATE INDEX "Organization_parentOrgId_idx" ON "Organization"("parentOrgId");
CREATE INDEX "Endpoint_organizationId_idx" ON "Endpoint"("organizationId");
CREATE INDEX "Endpoint_lastSeenAt_idx" ON "Endpoint"("lastSeenAt");
CREATE INDEX "GenAIApplication_organizationId_idx" ON "GenAIApplication"("organizationId");
CREATE INDEX "GenAIApplication_name_idx" ON "GenAIApplication"("name");
CREATE INDEX "GenAIApplication_domain_idx" ON "GenAIApplication"("domain");
CREATE INDEX "UsageEvent_eventType_idx" ON "UsageEvent"("eventType");
CREATE INDEX "UsageEvent_riskLevel_idx" ON "UsageEvent"("riskLevel");
CREATE INDEX "UsageEvent_createdAt_idx" ON "UsageEvent"("createdAt");
CREATE INDEX "Policy_organizationId_idx" ON "Policy"("organizationId");
CREATE INDEX "Policy_status_idx" ON "Policy"("status");
CREATE INDEX "Policy_name_idx" ON "Policy"("name");
CREATE INDEX "PolicyAssignment_organizationId_idx" ON "PolicyAssignment"("organizationId");
CREATE INDEX "PolicyAssignment_policyId_idx" ON "PolicyAssignment"("policyId");
CREATE INDEX "PolicyAssignment_assignmentType_assignmentTargetId_idx" ON "PolicyAssignment"("assignmentType", "assignmentTargetId");
CREATE INDEX "PolicyDelivery_endpointId_idx" ON "PolicyDelivery"("endpointId");
CREATE INDEX "PolicyDelivery_policyId_idx" ON "PolicyDelivery"("policyId");
CREATE INDEX "PolicyDelivery_deliveryStatus_idx" ON "PolicyDelivery"("deliveryStatus");
CREATE INDEX "AuditLog_organizationId_idx" ON "AuditLog"("organizationId");
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX "AuditLog_entityType_idx" ON "AuditLog"("entityType");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX "EducationRecommendation_organizationId_idx" ON "EducationRecommendation"("organizationId");
CREATE INDEX "EducationRecommendation_status_idx" ON "EducationRecommendation"("status");
CREATE INDEX "EnrollmentToken_organizationId_idx" ON "EnrollmentToken"("organizationId");
CREATE INDEX "EnrollmentToken_expiresAt_idx" ON "EnrollmentToken"("expiresAt");
CREATE INDEX "BrowserPluginInstall_organizationId_idx" ON "BrowserPluginInstall"("organizationId");
CREATE INDEX "BrowserPluginInstall_deviceId_idx" ON "BrowserPluginInstall"("deviceId");
CREATE INDEX "BrowserPluginInstall_pluginVersion_idx" ON "BrowserPluginInstall"("pluginVersion");
CREATE INDEX "PluginRollout_organizationId_idx" ON "PluginRollout"("organizationId");
CREATE INDEX "PluginRollout_pluginVersionId_idx" ON "PluginRollout"("pluginVersionId");
CREATE INDEX "PluginUpdateNotice_organizationId_idx" ON "PluginUpdateNotice"("organizationId");
CREATE INDEX "PluginUpdateNotice_status_idx" ON "PluginUpdateNotice"("status");
CREATE INDEX "Alert_organizationId_idx" ON "Alert"("organizationId");
CREATE INDEX "Alert_status_idx" ON "Alert"("status");
CREATE INDEX "Alert_severity_idx" ON "Alert"("severity");
CREATE INDEX "Alert_createdAt_idx" ON "Alert"("createdAt");
CREATE INDEX "Alert_sourceEventId_idx" ON "Alert"("sourceEventId");
CREATE INDEX "AlertComment_alertId_idx" ON "AlertComment"("alertId");
CREATE INDEX "EmailTemplate_organizationId_idx" ON "EmailTemplate"("organizationId");
CREATE INDEX "EmailTemplate_type_idx" ON "EmailTemplate"("type");
CREATE INDEX "EmailTemplate_status_idx" ON "EmailTemplate"("status");
CREATE INDEX "BrowserPluginDownload_organizationId_idx" ON "BrowserPluginDownload"("organizationId");
CREATE INDEX "BrowserPluginDownload_pluginVersionId_idx" ON "BrowserPluginDownload"("pluginVersionId");
CREATE INDEX "BrowserPluginDownload_downloadedAt_idx" ON "BrowserPluginDownload"("downloadedAt");

ALTER TABLE "OrganizationSettings" ADD CONSTRAINT "OrganizationSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GenAIApplication" ADD CONSTRAINT "GenAIApplication_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EducationRecommendation" ADD CONSTRAINT "EducationRecommendation_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EmailTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_sourceEventId_fkey" FOREIGN KEY ("sourceEventId") REFERENCES "UsageEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AlertComment" ADD CONSTRAINT "AlertComment_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Alert"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AlertComment" ADD CONSTRAINT "AlertComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmailTemplate" ADD CONSTRAINT "EmailTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BrowserPluginDownload" ADD CONSTRAINT "BrowserPluginDownload_pluginVersionId_fkey" FOREIGN KEY ("pluginVersionId") REFERENCES "BrowserPluginVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
