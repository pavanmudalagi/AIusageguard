CREATE TYPE "TargetBrowser" AS ENUM ('chrome', 'edge');
CREATE TYPE "PluginInstallStatus" AS ENUM ('installed', 'active', 'inactive', 'outdated', 'failed');

CREATE TABLE "BrowserPluginVersion" (
  "id" TEXT PRIMARY KEY,
  "version" TEXT NOT NULL,
  "browser" "TargetBrowser" NOT NULL,
  "packagePath" TEXT,
  "checksum" TEXT,
  "releaseNotes" TEXT NOT NULL,
  "isLatest" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "EnrollmentToken" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id"),
  "policyId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "targetBrowser" "TargetBrowser" NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdByUserId" TEXT NOT NULL REFERENCES "User"("id"),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "BrowserPluginInstall" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id"),
  "endpointId" TEXT REFERENCES "Endpoint"("id"),
  "deviceId" TEXT NOT NULL,
  "machineName" TEXT NOT NULL,
  "browser" "TargetBrowser" NOT NULL,
  "browserVersion" TEXT,
  "pluginVersion" TEXT NOT NULL,
  "installStatus" "PluginInstallStatus" NOT NULL,
  "lastSeenAt" TIMESTAMP(3),
  "currentPolicyId" TEXT,
  "currentPolicyVersion" TEXT,
  "policyStatus" "EndpointPolicyStatus" NOT NULL DEFAULT 'unknown',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("organizationId", "deviceId", "browser")
);
