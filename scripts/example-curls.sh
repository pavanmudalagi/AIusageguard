#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://localhost:4000/api/v1}"
TOKEN="${TOKEN:-demo-enrollment-token}"

curl -s -X POST "$API_URL/endpoints/check-in" \
  -H 'content-type: application/json' \
  -H "x-enrollment-token: $TOKEN" \
  -d '{
    "organizationId": "org_acme_dental",
    "deviceId": "device_abc",
    "hostname": "LAPTOP-123",
    "os": "windows",
    "osVersion": "11",
    "browserExtensionVersion": "0.6.0",
    "localAgentVersion": "0.1.0"
  }'

curl -s -X POST "$API_URL/events" \
  -H 'content-type: application/json' \
  -H "x-enrollment-token: $TOKEN" \
  -d '{
    "organizationId": "org_acme_dental",
    "deviceId": "device_abc",
    "userIdentifierHash": "hash_user_123",
    "genAIApplication": "ChatGPT",
    "genAIDomain": "chatgpt.com",
    "eventType": "sensitive_prompt_detected",
    "inputType": "prompt",
    "riskLevel": "high",
    "detectedCategories": ["email", "government_id"],
    "actionTaken": "blocked",
    "policyId": "pol_active",
    "policyVersion": "2026.05.07.002",
    "metadata": {
      "rawPromptCollected": false,
      "scanEngineVersion": "0.6.0"
    }
  }'
