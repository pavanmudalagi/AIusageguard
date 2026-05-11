export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "AI Usage Guard Management API",
    version: "0.1.0",
    description: "POC API for metadata-only GenAI usage governance, endpoint check-in, event ingestion, policy management, dashboards, and education."
  },
  servers: [{ url: "http://localhost:4000/api/v1" }],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      enrollmentToken: { type: "apiKey", in: "header", name: "x-enrollment-token" }
    }
  },
  paths: {
    "/auth/login": { post: { summary: "Admin login" } },
    "/auth/me": { get: { summary: "Current admin user" } },
    "/orgs": { get: { summary: "List organizations" }, post: { summary: "Create organization" } },
    "/endpoints/check-in": { post: { summary: "Endpoint check-in and latest policy pull", security: [{ enrollmentToken: [] }] } },
    "/endpoints/policy-status": { post: { summary: "Endpoint policy delivery status", security: [{ enrollmentToken: [] }] } },
    "/events": { post: { summary: "Ingest metadata-only telemetry event", security: [{ enrollmentToken: [] }] }, get: { summary: "List usage events" } },
    "/events/summary": { get: { summary: "Usage event summary" } },
    "/genai-apps": { get: { summary: "List discovered GenAI applications" }, post: { summary: "Create GenAI application" } },
    "/genai-apps/{id}/status": { put: { summary: "Update GenAI application approval status" } },
    "/policies": { get: { summary: "List policies" }, post: { summary: "Create policy" } },
    "/policies/{id}": { get: { summary: "Get policy" }, put: { summary: "Update draft policy" } },
    "/policies/{id}/publish": { post: { summary: "Publish policy" } },
    "/policies/{id}/archive": { post: { summary: "Archive policy" } },
    "/policies/{id}/assign": { post: { summary: "Assign policy" } },
    "/policies/{id}/delivery-status": { get: { summary: "Policy delivery status" } },
    "/dashboard/overview": { get: { summary: "Overview dashboard metrics" } },
    "/dashboard/risk-trends": { get: { summary: "Risk and action trend charts" } },
    "/dashboard/top-apps": { get: { summary: "Top GenAI apps" } },
    "/dashboard/top-risky-users": { get: { summary: "Top risky users" } },
    "/dashboard/policy-status": { get: { summary: "Endpoint policy status summary" } },
    "/browser-plugin/versions": { get: { summary: "List available Browser Shield plugin versions" } },
    "/browser-plugin/enrollment-token": { post: { summary: "Create short-lived browser plugin enrollment token" } },
    "/browser-plugin/package": { post: { summary: "Generate downloadable Browser Shield plugin ZIP package" } },
    "/browser-plugin/deployment-status": { get: { summary: "Browser plugin deployment status summary" } },
    "/education/recommendations": { get: { summary: "Education recommendations" } },
    "/education/generate-draft": { post: { summary: "Generate template-based education draft" } }
  }
};
