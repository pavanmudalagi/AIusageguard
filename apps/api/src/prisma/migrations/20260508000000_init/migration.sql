CREATE TYPE "OrganizationType" AS ENUM ('msp', 'customer');
CREATE TYPE "UserRole" AS ENUM ('super_admin', 'msp_admin', 'customer_admin', 'analyst', 'read_only');
CREATE TYPE "AppType" AS ENUM ('browser', 'desktop', 'browser_and_desktop');
CREATE TYPE "RiskLevel" AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE "ApprovedStatus" AS ENUM ('approved', 'restricted', 'blocked', 'unknown');
CREATE TYPE "InputType" AS ENUM ('prompt', 'file_upload', 'desktop_app', 'browser');
CREATE TYPE "ActionTaken" AS ENUM ('allowed', 'warned', 'blocked', 'redacted', 'user_override');
CREATE TYPE "PolicyStatus" AS ENUM ('draft', 'published', 'archived');
CREATE TYPE "EndpointPolicyStatus" AS ENUM ('unknown', 'pending', 'delivered', 'applied', 'failed', 'out_of_date');
CREATE TYPE "AssignmentType" AS ENUM ('organization', 'device_group', 'user_group', 'endpoint');
CREATE TYPE "DeliveryStatus" AS ENUM ('pending', 'delivered', 'applied', 'failed');
CREATE TYPE "EducationStatus" AS ENUM ('recommended', 'assigned', 'acknowledged', 'repeated_after_training');

CREATE TABLE "Organization" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "type" "OrganizationType" NOT NULL,
  "parentOrgId" TEXT,
  "enrollmentTokenHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "User" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id"),
  "email" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "role" "UserRole" NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Endpoint" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id"),
  "deviceId" TEXT NOT NULL,
  "hostname" TEXT NOT NULL,
  "os" TEXT NOT NULL,
  "osVersion" TEXT,
  "lastSeenAt" TIMESTAMP(3),
  "browserExtensionVersion" TEXT,
  "localAgentVersion" TEXT,
  "currentPolicyId" TEXT,
  "currentPolicyVersion" TEXT,
  "policyStatus" "EndpointPolicyStatus" NOT NULL DEFAULT 'unknown',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("organizationId", "deviceId")
);

CREATE TABLE "EndpointUser" (
  "id" TEXT PRIMARY KEY,
  "endpointId" TEXT NOT NULL REFERENCES "Endpoint"("id"),
  "userIdentifierHash" TEXT NOT NULL,
  "displayName" TEXT,
  "lastSeenAt" TIMESTAMP(3) NOT NULL,
  UNIQUE ("endpointId", "userIdentifierHash")
);

CREATE TABLE "GenAIApplication" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "appType" "AppType" NOT NULL,
  "domain" TEXT,
  "executableName" TEXT,
  "riskRating" "RiskLevel" NOT NULL,
  "approvedStatus" "ApprovedStatus" NOT NULL DEFAULT 'unknown',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("name", "domain", "executableName")
);

CREATE TABLE "UsageEvent" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id"),
  "endpointId" TEXT NOT NULL REFERENCES "Endpoint"("id"),
  "endpointUserId" TEXT REFERENCES "EndpointUser"("id"),
  "genAIApplicationId" TEXT REFERENCES "GenAIApplication"("id"),
  "genAIApplicationName" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "inputType" "InputType" NOT NULL,
  "riskLevel" "RiskLevel" NOT NULL,
  "detectedCategories" TEXT[] NOT NULL,
  "actionTaken" "ActionTaken" NOT NULL,
  "policyId" TEXT,
  "policyVersion" TEXT,
  "metadata" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Policy" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id"),
  "name" TEXT NOT NULL,
  "description" TEXT,
  "version" TEXT NOT NULL,
  "status" "PolicyStatus" NOT NULL DEFAULT 'draft',
  "policyJson" JSONB NOT NULL,
  "createdByUserId" TEXT NOT NULL REFERENCES "User"("id"),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedAt" TIMESTAMP(3)
);

CREATE TABLE "PolicyAssignment" (
  "id" TEXT PRIMARY KEY,
  "policyId" TEXT NOT NULL REFERENCES "Policy"("id"),
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id"),
  "assignmentType" "AssignmentType" NOT NULL,
  "assignmentTargetId" TEXT,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "PolicyDelivery" (
  "id" TEXT PRIMARY KEY,
  "policyId" TEXT NOT NULL REFERENCES "Policy"("id"),
  "endpointId" TEXT NOT NULL REFERENCES "Endpoint"("id"),
  "policyVersion" TEXT NOT NULL,
  "deliveryStatus" "DeliveryStatus" NOT NULL DEFAULT 'pending',
  "deliveredAt" TIMESTAMP(3),
  "appliedAt" TIMESTAMP(3),
  "errorMessage" TEXT
);

CREATE TABLE "AuditLog" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id"),
  "actorUserId" TEXT REFERENCES "User"("id"),
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "details" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "EducationRecommendation" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id"),
  "userIdentifierHash" TEXT NOT NULL,
  "endpointId" TEXT,
  "categories" TEXT[] NOT NULL,
  "riskyEventCount" INTEGER NOT NULL,
  "recommendedTopic" TEXT NOT NULL,
  "status" "EducationStatus" NOT NULL DEFAULT 'recommended',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "UsageEvent_organizationId_createdAt_idx" ON "UsageEvent"("organizationId", "createdAt");
CREATE INDEX "UsageEvent_endpointId_createdAt_idx" ON "UsageEvent"("endpointId", "createdAt");
