# AI Usage Guard Management Server

AI Usage Guard helps MSPs and IT teams govern generative AI usage across managed endpoints. This repository contains the POC management server and admin dashboard.

The POC receives metadata-only telemetry from simulated browser extensions and local endpoint agents, maintains endpoint and GenAI app inventory, manages policy, tracks policy delivery, and shows SaaS-style dashboards for risk, policy posture, and education recommendations.

## Architecture

- `apps/api`: Node.js, TypeScript, Express, Prisma, PostgreSQL, JWT auth, OpenAPI docs
- `apps/web`: React, TypeScript, Tailwind CSS, Recharts dashboard
- `packages/shared`: shared Zod schemas, policy model, event validation, privacy guards
- `packages/browser-plugin-agent`: reusable TypeScript SDK for Chrome extension check-in, policy cache, metadata event delivery, and offline retry
- `docker-compose.yml`: local PostgreSQL

No external AI APIs are used. Education drafts are generated from local templates.

## Local Dev Setup

```sh
cd ai-usage-guard-server
cp .env.example .env
npm install
docker compose up -d
npm run prisma:generate
npm run db:migrate
npm run db:seed
```

## Persistent Storage

AI Usage Guard uses PostgreSQL as the source of truth through Prisma. Dashboard-created organizations, users, policies, policy assignments, policy delivery state, endpoints, events, alerts, email templates, organization settings, plugin versions, plugin installs, rollout state, enrollment tokens, and audit logs are stored in Postgres and survive API restarts, dashboard restarts, Docker container restarts, browser plugin reloads, and system reboots as long as the Postgres volume is preserved.

Docker Compose mounts Postgres data at a named persistent volume:

```yaml
services:
  postgres:
    volumes:
      - postgres-data:/var/lib/postgresql/data

volumes:
  postgres-data:
```

Normal restart:

```sh
docker compose up -d
npm run db:migrate
npm run db:seed
npm run dev
```

`npm run db:seed` is non-destructive. It ensures default organizations, settings, plugin versions, GenAI apps, and email/education templates exist without clearing dashboard-created data or duplicating templates.

Reset, destructive:

```sh
npm run db:reset
```

Do not run `docker compose down -v` unless you intentionally want to delete all persisted database data. The `-v` flag removes the Postgres volume.

Retention settings are persisted per organization (`eventRetentionDays`, `alertRetentionDays`, `auditLogRetentionDays`), but the POC does not automatically delete historical events, alerts, or audit logs. Cleanup can be added as a scheduled job later.

Start the API:

```sh
npm run dev -w @ai-usage-guard/api
```

Start the dashboard:

```sh
npm run dev -w @ai-usage-guard/web
```

Run the browser plugin agent demo after the API and database are running:

```sh
npm run demo:browser-agent
```

## URLs

- API base URL: `http://localhost:4000/api/v1`
- API health: `http://localhost:4000/health`
- OpenAPI docs: `http://localhost:4000/api/docs`
- OpenAPI JSON: `http://localhost:4000/api/openapi.json`
- Dashboard: `http://localhost:5173`

## Modern Dashboard

The landing dashboard is an MSP/security-admin console with:

- organization/customer selector in the top header
- dark/light mode toggle
- AI usage and risk summary cards
- AI tools used summary with Recharts bar, donut, and line charts
- `Endpoint AI Usage & Policy Status` table with one row per endpoint and AI tool
- search, filters, sorting, pagination, and metadata-only CSV export
- links from machine names to endpoint details
- links from AI tools to application details
- links from PII attempt counts to filtered risk events
- policy edit and assignment actions from each endpoint/tool row

Supporting APIs:

- `GET /api/v1/dashboard/overview`
- `GET /api/v1/dashboard/ai-tools-summary`
- `GET /api/v1/dashboard/endpoint-ai-usage`

CSV export includes metadata only and never includes raw prompts, raw files, extracted content, screenshots, secrets, or PII values.

## Seed Login

- Email: `admin@secureflow.example`
- Password: `Password123!`

Demo endpoint enrollment token:

```txt
demo-enrollment-token
```

## Environment Variables

- `PORT`: API server port
- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: long random secret used to sign admin JWTs
- `JWT_EXPIRES_IN`: JWT lifetime
- `CORS_ORIGIN`: dashboard origin
- `RAW_COLLECTION_ENABLED`: reserved flag; keep `false` for this POC
- `DEFAULT_ENROLLMENT_TOKEN`: seed enrollment token

## Authentication Model

Admins authenticate with `POST /api/v1/auth/login` and use the returned JWT as a bearer token.

Browser extensions and endpoint agents use an organization enrollment token in `x-enrollment-token` for check-in, policy status, and telemetry ingestion.

## Endpoint Check-In Flow

1. Endpoint sends organization ID, device ID, hostname, OS, installed component versions, and current policy version.
2. Server upserts endpoint inventory and `lastSeenAt`.
3. Server resolves the latest applicable published policy assignment.
4. Server returns policy ID, version, and policy JSON.
5. Endpoint later reports delivery/apply status.

Example:

```sh
curl -s -X POST http://localhost:4000/api/v1/endpoints/check-in \
  -H 'content-type: application/json' \
  -H 'x-enrollment-token: demo-enrollment-token' \
  -d '{
    "organizationId": "org_acme_dental",
    "deviceId": "device_abc",
    "hostname": "LAPTOP-123",
    "os": "windows",
    "osVersion": "11",
    "browserExtensionVersion": "0.6.0",
    "localAgentVersion": "0.1.0",
    "currentPolicyId": "pol_active",
    "currentPolicyVersion": "2026.05.07.001"
  }'
```

Policy status:

```sh
curl -s -X POST http://localhost:4000/api/v1/endpoints/policy-status \
  -H 'content-type: application/json' \
  -H 'x-enrollment-token: demo-enrollment-token' \
  -d '{
    "organizationId": "org_acme_dental",
    "deviceId": "device_abc",
    "policyId": "pol_active",
    "policyVersion": "2026.05.07.002",
    "status": "applied",
    "errorMessage": null
  }'
```

## Event Ingestion Flow

The endpoint/browser component scans locally, decides the risk/action locally from policy, and reports metadata only.

Events include privacy-safe operational details such as machine name, user hash, GenAI app, domain, risk category, risk level, action taken, policy applied/version, event counts, file type, file size bucket, optional file hash, and category counts. They do not include actual PII values, raw prompts, extracted document text, screenshots, OCR output, or raw file contents by default.

Prompt event:

```sh
curl -s -X POST http://localhost:4000/api/v1/events \
  -H 'content-type: application/json' \
  -H 'x-enrollment-token: demo-enrollment-token' \
  -d '{
    "organizationId": "org_acme_dental",
    "deviceId": "device_abc",
    "userIdentifierHash": "hash_user_123",
    "genAIApplication": "ChatGPT",
    "genAIDomain": "chatgpt.com",
    "eventType": "sensitive_prompt_detected",
    "inputType": "prompt",
    "riskLevel": "high",
    "detectedCategories": ["email", "government_id", "bank_account"],
    "actionTaken": "blocked",
    "policyId": "pol_active",
    "policyVersion": "2026.05.07.002",
    "metadata": {
      "rawPromptCollected": false,
      "scanEngineVersion": "0.6.0",
      "machineName": "WIN-LAPTOP-001",
      "eventCount": 1,
      "sensitivePromptAttemptCount": 1,
      "categoryCounts": {
        "email": 1,
        "government_id": 1,
        "bank_account": 1
      }
    }
  }'
```

File upload event:

```sh
curl -s -X POST http://localhost:4000/api/v1/events \
  -H 'content-type: application/json' \
  -H 'x-enrollment-token: demo-enrollment-token' \
  -d '{
    "organizationId": "org_acme_dental",
    "deviceId": "device_abc",
    "userIdentifierHash": "hash_user_123",
    "genAIApplication": "Claude",
    "genAIDomain": "claude.ai",
    "eventType": "sensitive_file_upload_detected",
    "inputType": "file_upload",
    "fileType": "pdf",
    "fileSizeBucket": "1MB-5MB",
    "fileHash": "sha256_hash_optional",
    "riskLevel": "high",
    "detectedCategories": ["customer_name", "email", "contract_value"],
    "actionTaken": "blocked",
    "policyId": "pol_active",
    "policyVersion": "2026.05.07.002",
    "metadata": {
      "rawFileCollected": false,
      "scanEngineVersion": "0.6.0",
      "machineName": "MACBOOK-017",
      "eventCount": 1,
      "sensitiveFileUploadAttemptCount": 1,
      "fileType": "pdf",
      "fileSizeBucket": "1MB-5MB",
      "categoryCounts": {
        "customer_name": 1,
        "email": 1,
        "contract_value": 1
      }
    }
  }'
```

## Browser Plugin Agent SDK

The browser extension client SDK lives in `packages/browser-plugin-agent`.

Example usage:

```ts
import { AIUsageGuardBrowserAgent, ChromeStorageAdapter } from "@ai-usage-guard/browser-plugin-agent";

const client = new AIUsageGuardBrowserAgent({
  baseUrl: "http://localhost:4000",
  organizationId: "org_acme_dental",
  enrollmentToken: "demo-enrollment-token",
  deviceId: "device_abc",
  storage: new ChromeStorageAdapter()
});

await client.checkIn();
const policy = await client.getPolicy();

await client.reportGenAIUsage({
  userIdentifierHash: "hash_user_123",
  genAIApplication: "ChatGPT",
  genAIDomain: "chatgpt.com",
  policyId: policy?.policyId,
  policyVersion: policy?.policyVersion,
  metadata: { browser: "chrome", extensionVersion: "0.6.0" }
});
```

Chrome extension integration pattern:

- On extension startup: call `checkIn()`.
- On GenAI site detected: call `reportGenAIUsage()`.
- On sensitive prompt detected locally: call `reportSensitivePromptEvent()` with categories, risk, and action only.
- On sensitive file upload detected locally: call `reportSensitiveFileUploadEvent()` with file type, size bucket, optional hash, categories, risk, and action only.
- After policy is applied: call `reportPolicyStatus()`.
- On network failure: events are queued locally and retried by `flushQueue()`.

The SDK supports `MemoryStorageAdapter` for tests and `ChromeStorageAdapter` for extension use. It validates events before delivery or queueing and rejects forbidden fields such as `rawPrompt`, `promptText`, `prompt`, `fileContent`, `fileText`, `extractedText`, `ocrText`, `screenshot`, `password`, `tokenValue`, `apiKeyValue`, `secretValue`, and `piiValue`.

## Policy OTA vs Plugin Code Updates

AI Usage Guard supports over-the-air policy updates. Policies are JSON configuration documents fetched by the Browser Shield Plugin during check-in. The plugin validates and applies these policies locally without reinstall.

Browser plugin code updates are handled through standard extension deployment mechanisms such as Chrome Web Store, Chrome Enterprise policies, RMM/MDM deployment, or self-hosted enterprise update manifests. The plugin does not download or execute remote JavaScript from the server.

Allowed OTA data:

- policy JSON
- configuration JSON
- GenAI app/rules lists
- scanner rule configuration as pure data
- plugin version metadata and update notices

Not allowed:

- remote JavaScript execution
- dynamic script injection from the API
- CDN code
- `eval()` or `new Function()`
- remote module imports
- updating extension runtime code by downloading JS from the API

## Browser Shield Plugin Deployment And Updates

Admins can open `Browser Plugin Updates` in the dashboard at `/browser-plugin/updates` to register plugin versions, mark versions latest or required, start pilot/staged/full rollouts, generate deployment tokens, download Chrome or Edge ZIP packages, export outdated endpoint lists, and monitor plugin update status.

The ZIP contains:

```txt
browser-shield-plugin/
  manifest.json
  background/
  content/
  popup/
  options/
  assets/
  config/enrollment.json
```

`enrollment.json` includes server URL, organization ID, short-lived enrollment token, default policy ID, plugin mode, creation time, and expiry time. For production, use managed browser policies or device enrollment instead of embedding long-lived tokens in extension packages.

Browser plugin APIs:

- `GET /api/v1/browser-plugin/versions`
- `POST /api/v1/browser-plugin/versions`
- `POST /api/v1/browser-plugin/versions/:id/mark-latest`
- `POST /api/v1/browser-plugin/versions/:id/mark-required`
- `POST /api/v1/browser-plugin/versions/:id/deprecate`
- `POST /api/v1/browser-plugin/enrollment-token`
- `POST /api/v1/browser-plugin/package`
- `GET /api/v1/browser-plugin/deployment-status`
- `GET /api/v1/browser-plugin/download/:version`
- `POST /api/v1/browser-plugin/rollouts`
- `GET /api/v1/browser-plugin/rollouts/:id/status`
- `POST /api/v1/browser-plugin/update-status`
- `GET /api/v1/browser-plugin/update-manifest.xml`

### Plugin Version Tracking Flow

1. Admin registers a plugin version with release notes, severity, target browser, rollout ring, and optional checksum/package path.
2. Admin marks the version `latest` or `required`.
3. Browser Shield reports `pluginVersion` on endpoint check-in.
4. Server compares the installed version with the latest rollout-targeted version.
5. Check-in response includes `pluginUpdateAvailable` and metadata such as latest version, minimum required version, severity, release notes, checksum, and package download URL.
6. Plugin stores the update notice, reports `plugin_update_available`, and shows "A newer version is available. Contact your administrator."
7. Admin deploys code updates through Chrome Web Store, Chrome Enterprise policy, RMM/MDM, or approved self-hosted enterprise update mechanisms.

Evidence Collection Mode is shown in the dashboard as disabled and locked. The POC stores metadata only.

### Extension Build Validation

Build and validate the local Browser Shield extension package:

```sh
npm run validate:extension
```

Output:

```txt
dist/browser-shield-plugin/
dist/ai-usage-guard-browser-shield-0.7.1.zip
```

### Troubleshooting MV3 Service Worker Registration

Error:

```txt
Service worker registration failed. Status code: 15
Cannot use import statement outside a module
```

Cause:

The background service worker uses ES module imports but `manifest.json` does not set `background.type` to `module`.

Fix:

Add `"type": "module"` under `background`, or bundle the service worker without ES module imports. The generated Browser Shield package uses:

```json
"background": {
  "service_worker": "background/service-worker.js",
  "type": "module"
}
```

## Policy Sync Flow

Policies are created as drafts, published with a generated version, assigned to organizations or endpoints, then delivered on endpoint check-in. Delivery status is tracked in `PolicyDelivery` and summarized in the dashboard.

Policy OTA flow:

1. Admin edits and publishes policy in the dashboard.
2. Admin applies the policy to the organization/customer or applies it later.
3. Server creates `PolicyAssignment` and pending `PolicyDelivery` records.
4. Browser Shield checks in on startup, popup open, and by `chrome.alarms` every five minutes by default.
5. Server returns the latest applicable policy JSON and `nextCheckInSeconds`.
6. Plugin validates the policy envelope, caches it in `chrome.storage.local`, and starts enforcing it immediately.
7. Plugin reports `policy-status=applied` and event `policy_applied`.
8. If validation or network sync fails, the plugin keeps the old cached policy, reports `policy_sync_failed`, and retries later.

Policy validation is done with Zod. `storeRawPrompt` and `storeRawFileContent` must be `false`.

### Test Policy OTA

1. Run API and dashboard.
2. Open `/policies`, edit a draft or published policy, and publish it.
3. Choose `Apply to entire organization/customer` after publishing.
4. Load or reload the generated Browser Shield extension.
5. Open the extension popup or wait for the five-minute alarm check-in.
6. Open the policy details page and confirm delivery moves from pending/delivered to applied.
7. Use `Retry policy sync` to reset failed deliveries back to pending.

### Test Plugin Update Notification

1. Open `/browser-plugin/updates`.
2. Register version `0.9.0`, set severity to `recommended` or `required`, and mark it latest.
3. Start a pilot, staged, or full rollout for the selected organization.
4. Run or reload a Browser Shield plugin still reporting `0.7.1`.
5. Open the plugin popup or wait for check-in.
6. Confirm the popup shows the update notice and the dashboard endpoint table shows `update_available` or `update_required`.
7. Download the latest plugin package and deploy it through your browser/enterprise deployment workflow.

### Chrome Web Store And Enterprise Guidance

- Chrome Web Store deployments should use Chrome Web Store versioning and release channels.
- Chrome Enterprise deployments should use managed extension policies, force install lists, managed storage, RMM, MDM, or approved enterprise update mechanisms.
- Self-hosted enterprise deployments can use `GET /api/v1/browser-plugin/update-manifest.xml` as a POC update manifest. The manifest references the latest approved package URL and is intended only for managed enterprise extension deployment.
- The package download flow creates an admin deployment artifact. Browser Shield does not fetch that package and execute its JavaScript at runtime.

## Privacy Guarantees

The server rejects telemetry containing suspicious raw or secret fields such as `rawPrompt`, `promptText`, `fileContent`, `screenshot`, `secretValue`, `password`, `tokenValue`, or `privateKey`.

The server stores:

- device and tenant identifiers
- user hash or configured display label
- GenAI app name/domain/executable metadata
- input type
- detected risk categories
- risk level
- action taken
- policy ID/version
- timestamps
- file type, file size bucket, optional file hash
- count-based summaries

The server does not store:

- raw prompt text
- raw file content
- actual PII values
- passwords, API keys, tokens, private keys
- screenshots
- full document content

## Known Limitations

- Browser plugin update management tracks versions and notifies endpoints; extension code replacement still depends on Chrome Web Store, Chrome Enterprise, RMM/MDM, or self-hosted enterprise extension update support.
- POC does not inspect actual files.
- File scanning happens on endpoint/browser extension/local agent side.
- Server stores metadata only.
- Policy enforcement occurs on endpoint/browser extension/local agent side.
- Dashboard is for visibility, policy management, and reporting.
- API key rotation UI is a demo control; production rotation workflows need confirmation, revocation windows, and audit review.

## Future Roadmap

- Real browser extension and local agent enrollment flows
- Device and user group assignment resolution
- Customer-scoped RBAC hardening and SCIM/SAML integrations
- Background jobs for retention, education, and policy compliance
- Signed policy bundles and endpoint attestation
- Richer OpenAPI schemas and generated clients
- Production observability, audit export, and SIEM integrations
