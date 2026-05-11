ALTER TYPE "InputType" ADD VALUE IF NOT EXISTS 'app_usage';
ALTER TYPE "InputType" ADD VALUE IF NOT EXISTS 'policy';

ALTER TYPE "ActionTaken" ADD VALUE IF NOT EXISTS 'detected';
ALTER TYPE "ActionTaken" ADD VALUE IF NOT EXISTS 'scanned';
ALTER TYPE "ActionTaken" ADD VALUE IF NOT EXISTS 'replaced';
ALTER TYPE "ActionTaken" ADD VALUE IF NOT EXISTS 'failed';
ALTER TYPE "ActionTaken" ADD VALUE IF NOT EXISTS 'unsupported';

ALTER TABLE "UsageEvent"
  ADD COLUMN IF NOT EXISTS "genAIDomain" TEXT,
  ADD COLUMN IF NOT EXISTS "detectedCategoryCounts" JSONB,
  ADD COLUMN IF NOT EXISTS "policyName" TEXT,
  ADD COLUMN IF NOT EXISTS "policyMode" TEXT,
  ADD COLUMN IF NOT EXISTS "fileType" TEXT,
  ADD COLUMN IF NOT EXISTS "fileSizeBucket" TEXT,
  ADD COLUMN IF NOT EXISTS "scanStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "scanFailureReason" TEXT,
  ADD COLUMN IF NOT EXISTS "userOverride" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "userJustificationProvided" BOOLEAN NOT NULL DEFAULT false;

UPDATE "UsageEvent"
SET "detectedCategoryCounts" = COALESCE("metadata"->'detectedCategoryCounts', '{}'::jsonb)
WHERE "detectedCategoryCounts" IS NULL;

UPDATE "UsageEvent"
SET
  "policyName" = COALESCE("policyName", "metadata"->>'policyName'),
  "fileType" = COALESCE("fileType", "metadata"->>'fileType'),
  "fileSizeBucket" = COALESCE("fileSizeBucket", "metadata"->>'fileSizeBucket'),
  "userOverride" = COALESCE(("metadata"->>'userOverride')::boolean, false),
  "userJustificationProvided" = COALESCE(("metadata"->>'userJustificationProvided')::boolean, false);
