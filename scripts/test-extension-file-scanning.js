const assert = require("node:assert/strict");

const categoryLabels = {
  customer_name: "Customer name",
  government_id: "Government ID / Social Security-like identifier",
  phone: "Phone number"
};

function scanSensitiveContent(text) {
  const findings = [];
  addTableAwareFindings(findings, text);
  addRegex(findings, text, "phone", /(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?){2,4}\d{3,4}\b/g);
  addRegex(findings, text, "government_id", /\b\d{3}-\d{2}-\d{4}\b/g);
  return summarize(findings);
}

function addRegex(findings, text, category, regex) {
  regex.lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    findings.push({ category, value: match[0], start: match.index, end: match.index + match[0].length });
    if (match.index === regex.lastIndex) regex.lastIndex += 1;
  }
}

function addTableAwareFindings(findings, text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = 0; index < lines.length - 1; index += 1) {
    const delimiter = detectTableDelimiter(lines[index]);
    if (!delimiter) continue;
    const headers = splitTableRow(lines[index], delimiter);
    const categoryByColumn = headers.map(categoryForTableHeader);
    if (!categoryByColumn.some(Boolean)) continue;
    let searchFrom = text.indexOf(lines[index]) + lines[index].length;
    for (const rowLine of lines.slice(index + 1)) {
      if (!rowLine.includes(delimiter)) break;
      const values = splitTableRow(rowLine, delimiter);
      const rowStart = text.indexOf(rowLine, Math.max(0, searchFrom));
      searchFrom = rowStart >= 0 ? rowStart + rowLine.length : searchFrom;
      values.forEach((value, columnIndex) => {
        const category = categoryByColumn[columnIndex];
        const cleanValue = value.trim();
        const localIndex = rowLine.indexOf(value);
        const start = rowStart >= 0 && localIndex >= 0 ? rowStart + localIndex : -1;
        if (category && cleanValue) findings.push({ category, value: cleanValue, start, end: start + cleanValue.length });
      });
    }
  }
}

function detectTableDelimiter(line) {
  if (line.includes("|")) return "|";
  if (line.includes(",")) return ",";
  if (line.includes("\t")) return "\t";
  return "";
}

function splitTableRow(line, delimiter) {
  return delimiter === "," ? line.split(",").map((value) => value.trim().replace(/^"|"$/g, "")) : line.split(delimiter).map((value) => value.trim());
}

function categoryForTableHeader(header) {
  const normalized = header.trim().toLowerCase();
  if (/^(name|customer\s+name|patient\s+name|contact\s+name)$/.test(normalized)) return "customer_name";
  if (/^(ssn|social\s+security\s+number|social\s+security|government\s+id|national\s+id|tax\s+id|passport|aadhaar|aadhar)$/.test(normalized)) return "government_id";
  if (/mobile|phone|telephone/.test(normalized)) return "phone";
  return "";
}

function summarize(findings) {
  const counts = {};
  const filtered = removeOverlaps(findings);
  const seen = new Set();
  for (const finding of filtered) {
    const key = `${finding.category}:${finding.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    counts[finding.category] = (counts[finding.category] || 0) + 1;
  }
  return {
    scanStatus: "completed",
    hasSensitiveData: Object.keys(counts).length > 0,
    riskLevel: counts.government_id ? "high" : Object.keys(counts).length ? "medium" : "low",
    detectedCategories: Object.keys(counts),
    detectedCategoryCounts: counts
  };
}

function removeOverlaps(findings) {
  const rank = { government_id: 80, customer_name: 65, phone: 40 };
  const accepted = [];
  for (const finding of [...findings].sort((a, b) => (rank[b.category] || 0) - (rank[a.category] || 0) || (a.start ?? 0) - (b.start ?? 0))) {
    if (!accepted.some((candidate) => Number.isFinite(finding.start) && Number.isFinite(candidate.start) && finding.start < candidate.end && finding.end > candidate.start)) accepted.push(finding);
  }
  return accepted;
}

function evaluateFilePolicy(scanResult, policy, scanStatus = scanResult.scanStatus, fileType = "csv") {
  if (scanStatus === "failed") return { action: policy.fileScanning.onScanFailure, showPopup: policy.fileScanning.onScanFailure !== "allow", reason: "File scan failed." };
  if (scanStatus === "unsupported") return { action: policy.fileScanning.onUnsupportedFileType, showPopup: policy.fileScanning.onUnsupportedFileType !== "allow", reason: "File type is not supported for local scanning." };
  if (!scanResult.hasSensitiveData) return { action: "allow", showPopup: false, reason: "No sensitive data detected in attached file." };
  const action = policy.onPiiDetected.fileUploadAction;
  return {
    action,
    showPopup: action !== "allow",
    reason: action === "block"
      ? "Attached file contains sensitive information that is not allowed by policy."
      : action === "warn"
        ? "Attached file contains sensitive information. Review before uploading."
        : "Sensitive data detected but allowed by policy.",
    fileType
  };
}

function makeStoredZip(entries) {
  const chunks = [];
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const data = Buffer.from(entry.text);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(0, 8);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(name.length, 26);
    chunks.push(header, name, data);
  }
  return Buffer.concat(chunks);
}

function extractOfficeText(buffer) {
  const entries = [];
  let offset = 0;
  while (offset + 30 < buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const compression = buffer.readUInt16LE(offset + 8);
    const size = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString("utf8");
    const dataStart = nameStart + nameLength + extraLength;
    const data = buffer.subarray(dataStart, dataStart + size);
    if (compression === 0 && name.startsWith("xl/") && name.endsWith(".xml")) entries.push(data.toString("utf8").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    offset = dataStart + size;
  }
  return entries.join("\n");
}

const csv = `Name,SSN,Mobile number
Jane S,123-132-1234,+1 445-123-4562
John D,321-123-1231,+1 555-123-1234`;
const pipe = `Name | SSN | Mobile number
Jane S | 123-132-1234 | +1 445-123-4562
John D | 321-123-1231 | +1 555-123-1234`;
const xlsxFixture = makeStoredZip([{ name: "xl/worksheets/sheet1.xml", text: `<sheetData>
<row><c><t>Name</t></c><c><t>SSN</t></c><c><t>Mobile number</t></c></row>
<row><c><t>Jane S</t></c><c><t>123-132-1234</t></c><c><t>+1 445-123-4562</t></c></row>
<row><c><t>John D</t></c><c><t>321-123-1231</t></c><c><t>+1 555-123-1234</t></c></row>
</sheetData>` }]);

assert.equal(extractOfficeText(xlsxFixture).includes("Jane S"), true);
for (const input of [csv, pipe]) {
  const result = scanSensitiveContent(input);
  assert.equal(result.hasSensitiveData, true);
  assert.equal(result.riskLevel, "high");
  assert.deepEqual(result.detectedCategories.sort(), ["customer_name", "government_id", "phone"]);
  assert.deepEqual(result.detectedCategoryCounts, { customer_name: 2, government_id: 2, phone: 2 });
  assert.equal(JSON.stringify(result).includes("Jane S"), false);
  assert.equal(JSON.stringify(result).includes("123-132-1234"), false);
}

const clean = scanSensitiveContent("Quarterly roadmap update with no personal data.");
assert.equal(clean.hasSensitiveData, false);

const blockPolicy = { fileScanning: { onScanFailure: "block", onUnsupportedFileType: "warn" }, onPiiDetected: { fileUploadAction: "block" } };
const warnPolicy = { fileScanning: { onScanFailure: "block", onUnsupportedFileType: "warn" }, onPiiDetected: { fileUploadAction: "warn" } };
const allowPolicy = { fileScanning: { onScanFailure: "block", onUnsupportedFileType: "warn" }, onPiiDetected: { fileUploadAction: "allow" } };

assert.equal(evaluateFilePolicy(scanSensitiveContent(csv), blockPolicy).action, "block");
assert.equal(evaluateFilePolicy(scanSensitiveContent(csv), warnPolicy).action, "warn");
assert.equal(evaluateFilePolicy(scanSensitiveContent(csv), allowPolicy).action, "allow");
assert.deepEqual(evaluateFilePolicy(clean, blockPolicy), { action: "allow", showPopup: false, reason: "No sensitive data detected in attached file." });
assert.equal(evaluateFilePolicy(clean, blockPolicy, "failed").action, "block");
assert.equal(evaluateFilePolicy(clean, blockPolicy, "unsupported").action, "warn");
assert.equal(categoryLabels.customer_name, "Customer name");

console.log("Extension file scanning tests passed");
