import fs from "node:fs/promises";
import path from "node:path";
import { pluginFiles } from "../apps/api/src/modules/browser-plugin/package-template";
import { createZip } from "../apps/api/src/modules/browser-plugin/zip";

const root = process.cwd();
const outDir = path.join(root, "dist/browser-shield-plugin");
const zipPath = path.join(root, "dist/ai-usage-guard-browser-shield-0.7.1.zip");

const enrollment = {
  serverUrl: process.env.AIUG_EXTENSION_SERVER_URL ?? "http://localhost:4000",
  organizationId: process.env.AIUG_EXTENSION_ORG_ID ?? "org_acme_dental",
  enrollmentToken: process.env.AIUG_EXTENSION_ENROLLMENT_TOKEN ?? "enroll_demo_short_lived_token",
  defaultPolicyId: process.env.AIUG_EXTENSION_POLICY_ID ?? "pol_active",
  pluginMode: "managed",
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
};

async function main() {
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(path.dirname(zipPath), { recursive: true });

  const files = pluginFiles(enrollment, "chrome");
  for (const [filePath, content] of Object.entries(files)) {
    const relative = filePath.replace(/^browser-shield-plugin\//, "");
    const target = path.join(outDir, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
  }

  await fs.writeFile(zipPath, createZip(files));
  console.log(`Built extension: ${outDir}`);
  console.log(`Built ZIP: ${zipPath}`);
}

main();
