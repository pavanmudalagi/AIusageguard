ALTER TYPE "DeliveryStatus" ADD VALUE IF NOT EXISTS 'outdated';

CREATE TYPE "BrowserPluginVersionStatus" AS ENUM ('draft', 'published', 'latest', 'deprecated');
CREATE TYPE "PluginUpdateSeverity" AS ENUM ('optional', 'recommended', 'required');
CREATE TYPE "PluginRolloutRing" AS ENUM ('pilot', 'staged', 'full');
CREATE TYPE "PluginUpdateStatus" AS ENUM ('up_to_date', 'update_available', 'update_required', 'pending_admin_deployment', 'failed', 'unknown');
CREATE TYPE "PluginRolloutTargetType" AS ENUM ('organization', 'endpoint_group', 'endpoint');
CREATE TYPE "PluginRolloutStatus" AS ENUM ('draft', 'active', 'paused', 'completed');
CREATE TYPE "PluginUpdateNoticeStatus" AS ENUM ('pending', 'seen', 'acknowledged', 'completed');

ALTER TABLE "BrowserPluginVersion"
  ADD COLUMN "status" "BrowserPluginVersionStatus" NOT NULL DEFAULT 'draft',
  ADD COLUMN "targetBrowser" "TargetBrowser" NOT NULL DEFAULT 'chrome',
  ADD COLUMN "minimumSupportedVersion" TEXT,
  ADD COLUMN "severity" "PluginUpdateSeverity" NOT NULL DEFAULT 'recommended',
  ADD COLUMN "rolloutRing" "PluginRolloutRing" NOT NULL DEFAULT 'full',
  ADD COLUMN "createdByUserId" TEXT,
  ADD COLUMN "publishedAt" TIMESTAMP(3),
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "BrowserPluginVersion"
SET
  "targetBrowser" = "browser",
  "status" = CASE WHEN "isLatest" THEN 'latest'::"BrowserPluginVersionStatus" ELSE 'published'::"BrowserPluginVersionStatus" END,
  "publishedAt" = "createdAt";

ALTER TABLE "BrowserPluginInstall"
  ADD COLUMN "latestAvailableVersion" TEXT,
  ADD COLUMN "updateStatus" "PluginUpdateStatus" NOT NULL DEFAULT 'unknown';

CREATE TABLE "PluginRollout" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "pluginVersionId" TEXT NOT NULL,
  "rolloutName" TEXT NOT NULL,
  "rolloutRing" "PluginRolloutRing" NOT NULL,
  "targetType" "PluginRolloutTargetType" NOT NULL,
  "targetId" TEXT,
  "status" "PluginRolloutStatus" NOT NULL DEFAULT 'draft',
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PluginRollout_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PluginUpdateNotice" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "endpointId" TEXT NOT NULL,
  "pluginVersionId" TEXT NOT NULL,
  "status" "PluginUpdateNoticeStatus" NOT NULL DEFAULT 'pending',
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acknowledgedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PluginUpdateNotice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BrowserPluginVersion_version_targetBrowser_key" ON "BrowserPluginVersion"("version", "targetBrowser");
CREATE UNIQUE INDEX "PluginUpdateNotice_endpointId_pluginVersionId_key" ON "PluginUpdateNotice"("endpointId", "pluginVersionId");

ALTER TABLE "BrowserPluginVersion" ADD CONSTRAINT "BrowserPluginVersion_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PluginRollout" ADD CONSTRAINT "PluginRollout_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PluginRollout" ADD CONSTRAINT "PluginRollout_pluginVersionId_fkey" FOREIGN KEY ("pluginVersionId") REFERENCES "BrowserPluginVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PluginRollout" ADD CONSTRAINT "PluginRollout_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PluginUpdateNotice" ADD CONSTRAINT "PluginUpdateNotice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PluginUpdateNotice" ADD CONSTRAINT "PluginUpdateNotice_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "Endpoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PluginUpdateNotice" ADD CONSTRAINT "PluginUpdateNotice_pluginVersionId_fkey" FOREIGN KEY ("pluginVersionId") REFERENCES "BrowserPluginVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
