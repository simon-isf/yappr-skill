# Google Forms → Sheets → Lead Intake

> **Use in Yappr context**: Receive leads submitted via Google Forms (the most common free lead capture tool among Israeli SMBs) and queue them for an AI outbound callback call.

## Authentication

**Pattern 1 — Google Apps Script (real-time, recommended)**: No external auth needed. Apps Script runs inside Google's infrastructure with the sheet owner's permissions. The script calls your Supabase edge function using `UrlFetchApp` with a service role key or a simple shared secret.

**Pattern 2 — Google Sheets API polling**: OAuth 2.0 or a Service Account with a JSON key. Service accounts are easier for server-to-server use — create one in Google Cloud Console, share the spreadsheet with the service account email, and use its JSON key to get a Bearer token.

## Base URL

```
https://sheets.googleapis.com/v4/spreadsheets     — Sheets API
https://script.googleapis.com/v1/scripts          — Apps Script API (rarely needed)
```

## Integration Patterns

### Pattern 1 — Google Apps Script trigger (real-time)

**Setup steps:**
1. Open your Google Form → Responses tab → click the green Sheets icon to link a response spreadsheet.
2. In the linked spreadsheet: Extensions → Apps Script.
3. Paste the script below.
4. Set trigger: Triggers (alarm icon) → Add Trigger → function: `onFormSubmit` → Event source: From spreadsheet → Event type: On form submit.

```javascript
// Google Apps Script — paste in Extensions → Apps Script
// Adjust column indices to match your form field order.
// Column 0 = Timestamp (always first), then fields in form order.

var SUPABASE_URL = "https://YOUR-PROJECT.supabase.co/functions/v1/receive-lead";
var SUPABASE_ANON_KEY = "eyJ..."; // use anon key + RLS, or service role key for internal functions

function onFormSubmit(e) {
  try {
    var row = e.values; // Array of cell values: [timestamp, field1, field2, ...]

    // Adjust these indices to match your form's column order:
    var timestamp = row[0];   // Always index 0
    var name      = row[1];   // "Full Name" — your form's first field
    var phone     = row[2];   // "Phone Number"
    var email     = row[3];   // "Email Address" (optional)
    var service   = row[4];   // "Service Needed" (optional)
    var notes     = row[5];   // "Additional Notes" (optional)

    if (!phone) {
      Logger.log("Skipping submission with no phone: " + JSON.stringify(row));
      return;
    }

    var payload = {
      phone_number: phone,
      name: name,
      email: email || null,
      metadata: {
        source: "google_forms",
        service: service || null,
        notes: notes || null,
        submitted_at: timestamp
      }
    };

    var options = {
      method: "POST",
      contentType: "application/json",
      headers: {
        "Authorization": "Bearer " + SUPABASE_ANON_KEY
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    var response = UrlFetchApp.fetch(SUPABASE_URL, options);
    Logger.log("Lead queued. Status: " + response.getResponseCode() + " Body: " + response.getContentText());

  } catch (err) {
    Logger.log("Error in onFormSubmit: " + err.toString());
    // Don't throw — a failed trigger won't block the form submission
  }
}
```

**Finding column indices**: Open the linked spreadsheet, look at the header row (row 1). Timestamp is always column A (index 0). Your form fields follow in the order they appear in the form. Count left-to-right starting from 0.

---

### Pattern 2 — Sheets API polling (periodic, using service account)

Use this when you can't set up Apps Script, or want to process submissions in batches.

**Setup:**
1. Create a Service Account in Google Cloud Console (IAM & Admin → Service Accounts).
2. Download the JSON key file.
3. Share the Google Spreadsheet with the service account email (give Viewer access).
4. Use the key to generate a short-lived Bearer token via the Google Auth API.

#### Step 1 — Exchange service account key for a Bearer token

```typescript
import { createSign } from "node:crypto"; // Deno supports node: builtins

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  private_key_id: string;
}

async function getGoogleBearerToken(
  serviceAccountKey: ServiceAccountKey,
  scope = "https://www.googleapis.com/auth/spreadsheets.readonly"
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT", kid: serviceAccountKey.private_key_id }));
  const payload = btoa(JSON.stringify({
    iss: serviceAccountKey.client_email,
    scope,
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  }));

  const signingInput = `${header}.${payload}`;

  // Sign with RSA-SHA256
  const privateKey = serviceAccountKey.private_key;
  const sign = createSign("RSA-SHA256");
  sign.update(signingInput);
  const signature = sign.sign(privateKey, "base64url");

  const jwt = `${signingInput}.${signature}`;

  // Exchange JWT for access token
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const tokenData = await tokenRes.json();
  return tokenData.access_token as string;
}
```

#### Step 2 — Read rows from the spreadsheet

```typescript
async function readSheetRows(
  spreadsheetId: string,
  range: string, // e.g. "Form Responses 1!A:F"
  bearerToken: string
): Promise<string[][]> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, {
    headers: { "Authorization": `Bearer ${bearerToken}` },
  });
  const data = await res.json();
  return (data.values ?? []) as string[][];
}
```

#### Step 3 — Track last-processed row and process new ones

```typescript
// In your cron edge function or scheduled task:
async function pollGoogleFormsLeads(spreadsheetId: string, serviceAccountKey: ServiceAccountKey) {
  const token = await getGoogleBearerToken(serviceAccountKey);
  const rows = await readSheetRows(spreadsheetId, "Form Responses 1!A:F", token);

  if (rows.length < 2) return; // Only header row, no submissions

  // Header row is index 0: ["Timestamp", "Full Name", "Phone", "Email", "Service", "Notes"]
  const headers = rows[0];
  const dataRows = rows.slice(1); // Skip header

  // Retrieve last processed row count from your DB or KV store
  // Here shown as a simple example — store this in your DB:
  const lastProcessedCount = await getLastProcessedRowCount(spreadsheetId);
  const newRows = dataRows.slice(lastProcessedCount);

  for (const row of newRows) {
    const [timestamp, name, phone, email, service, notes] = row;
    if (!phone) continue;

    await queueLeadForCallback({
      phone_number: normalizeIsraeliPhone(phone),
      name,
      email: email || null,
      metadata: { source: "google_forms", service, notes, submitted_at: timestamp },
    });
  }

  // Update last processed count
  await setLastProcessedRowCount(spreadsheetId, dataRows.length);
}

function normalizeIsraeliPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("972")) return `+${digits}`;
  if (digits.startsWith("0")) return `+972${digits.slice(1)}`;
  return `+${digits}`;
}
```

---

### Key Sheets API endpoint — GET values from a range

```
GET https://sheets.googleapis.com/v4/spreadsheets/{spreadsheetId}/values/{range}
Authorization: Bearer {access_token}
```

- `{spreadsheetId}`: the long ID in the spreadsheet URL (between `/d/` and `/edit`)
- `{range}`: A1 notation, e.g. `Sheet1!A:Z` or `Form Responses 1!A1:F1000`

Response:

```json
{
  "range": "Form Responses 1!A1:F4",
  "majorDimension": "ROWS",
  "values": [
    ["Timestamp", "Full Name", "Phone", "Email", "Service", "Notes"],
    ["1/20/2024 12:00:00", "David Cohen", "0501234567", "david@example.com", "Plumbing", "Leaking pipe"],
    ["1/20/2024 12:05:00", "Sara Levi", "0521234567", "", "Electrical", ""],
    ["1/20/2024 12:10:00", "Moshe Ben-David", "0541234567", "moshe@example.com", "Plumbing", ""]
  ]
}
```

Rows with blank trailing cells will have shorter arrays (trailing empty strings are omitted). Always index safely: `row[3] ?? ""`.

---

### Key Sheets API endpoint — GET spreadsheet metadata

```
GET https://sheets.googleapis.com/v4/spreadsheets/{spreadsheetId}
Authorization: Bearer {access_token}
```

Use this to discover sheet names and their IDs:

```json
{
  "spreadsheetId": "1BxiMVs...",
  "properties": { "title": "Lead Form (Responses)" },
  "sheets": [
    {
      "properties": {
        "sheetId": 0,
        "title": "Form Responses 1",
        "index": 0,
        "sheetType": "GRID",
        "gridProperties": { "rowCount": 1000, "columnCount": 26 }
      }
    }
  ]
}
```

---

## Common Patterns

### Apps Script — complete trigger with error notification

```javascript
// Enhanced version with error logging to a dedicated sheet

var SUPABASE_URL = "https://YOUR-PROJECT.supabase.co/functions/v1/receive-lead";
var SUPABASE_ANON_KEY = "eyJ...";
var SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();

function onFormSubmit(e) {
  var row = e.values;
  var timestamp = row[0];
  var name = row[1] || "Unknown";
  var phone = row[2] || "";
  var email = row[3] || "";

  if (!phone) return;

  var normalized = normalizeIsraeliPhone(phone);

  var options = {
    method: "POST",
    contentType: "application/json",
    headers: { "Authorization": "Bearer " + SUPABASE_ANON_KEY },
    payload: JSON.stringify({
      phone_number: normalized,
      name: name,
      email: email || null,
      metadata: { source: "google_forms", submitted_at: timestamp }
    }),
    muteHttpExceptions: true
  };

  var res = UrlFetchApp.fetch(SUPABASE_URL, options);
  if (res.getResponseCode() !== 200) {
    logError("receive-lead failed: " + res.getResponseCode() + " " + res.getContentText());
  }
}

function normalizeIsraeliPhone(phone) {
  var digits = phone.replace(/\D/g, "");
  if (digits.indexOf("972") === 0) return "+" + digits;
  if (digits.charAt(0) === "0") return "+972" + digits.slice(1);
  return "+" + digits;
}

function logError(message) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var logSheet = ss.getSheetByName("Errors") || ss.insertSheet("Errors");
  logSheet.appendRow([new Date(), message]);
}
```

---

## Gotchas & Rate Limits

- **Column order depends on form order**: Google Forms maps fields to columns in the exact order they appear in the form. If you reorder form fields, column indices shift. Always verify by checking the header row of the linked spreadsheet.
- **Timestamp format is locale-dependent**: The timestamp in row[0] uses the spreadsheet's locale settings (e.g. `1/20/2024 12:00:00` for US locale, `20/01/2024 12:00:00` for Israeli locale). Parse defensively or ignore it in favor of the current time.
- **Empty trailing cells are omitted**: A row with 6 fields where the last 2 are empty will be returned as an array of 4 elements, not 6. Always use `row[n] ?? ""` instead of `row[n]`.
- **Apps Script execution quotas**: Free Google accounts get 6 minutes of script runtime per day; Google Workspace accounts get 30 minutes. Each `onFormSubmit` execution counts against this. Keep the trigger function fast — offload heavy processing to Supabase.
- **Service account must be a viewer on the sheet**: Share the spreadsheet explicitly with the service account email address. The service account has no access to files it hasn't been shared with, even with full project permissions.
- **Sheets API rate limits**: 300 requests per minute per project, 60 requests per minute per user. For polling, run every 5-10 minutes to stay well within limits.
- **Apps Script trigger delays**: `onFormSubmit` triggers fire within seconds of submission — effectively real-time. The Sheets API polling approach has latency equal to your polling interval (typically 5-15 minutes).
- **Phone normalization is critical**: Israeli phones are almost always submitted as `05XXXXXXXX`. Without normalization to `+972XXXXXXXXX`, dialing will fail. Always normalize before storing.
- **Duplicate submissions**: Google Forms does not prevent duplicate submissions. If a user hits the back button and resubmits, or submits twice, you'll get duplicate rows. Deduplicate by phone number before queueing callbacks.
