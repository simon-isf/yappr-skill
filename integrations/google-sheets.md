# Google Sheets

> **Use in Yappr context**: Append call outcomes as rows to a shared spreadsheet — a simple CRM alternative for teams not using a dedicated CRM system.

## Authentication

Same service account pattern as Google Calendar:

1. GCP Console → Service Accounts → Create → Download JSON key
2. Share the spreadsheet with the service account email (just like sharing with a person)
3. Required scope: `https://www.googleapis.com/auth/spreadsheets`

```typescript
import { GoogleAuth } from "npm:google-auth-library";

const auth = new GoogleAuth({
  credentials: JSON.parse(Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON")!),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const { token } = await (await auth.getClient()).getAccessToken();
```

## Base URL

```
https://sheets.googleapis.com/v4/spreadsheets
```

**Spreadsheet ID** is the long string in the Google Sheets URL:
`https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit`

## Key Endpoints

### Append Row
**POST /{spreadsheetId}/values/{range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS**

**Headers:**
```
Authorization: Bearer {access_token}
Content-Type: application/json
```

**Request (append one row):**
```json
{
  "values": [
    ["2026-04-11", "David Cohen", "+972501234567", "david@example.com", "Appointment Set", "Interested in Business plan"]
  ]
}
```

**Range examples:**
- `Sheet1!A:F` — append after last row in columns A–F
- `Sheet1` — append anywhere on the sheet

**Response:**
```json
{
  "spreadsheetId": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms",
  "tableRange": "Sheet1!A1:F42",
  "updates": {
    "spreadsheetId": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms",
    "updatedRange": "Sheet1!A43:F43",
    "updatedRows": 1,
    "updatedColumns": 6,
    "updatedCells": 6
  }
}
```

`updatedRange` tells you where the row was appended.

---

### Read Rows
**GET /{spreadsheetId}/values/{range}**

**Request URL example:**
```
GET /{spreadsheetId}/values/Sheet1!A1:F100
```

**Response:**
```json
{
  "range": "Sheet1!A1:F100",
  "majorDimension": "ROWS",
  "values": [
    ["Date", "Name", "Phone", "Email", "Disposition", "Notes"],
    ["2026-04-11", "David Cohen", "+972501234567", "david@example.com", "Appointment Set", "..."]
  ]
}
```

First row is typically headers. If the sheet has no data beyond the range, `values` may be omitted.

---

### Update Specific Cells
**PUT /{spreadsheetId}/values/{range}?valueInputOption=USER_ENTERED**

**Request:**
```json
{
  "range": "Sheet1!E43",
  "majorDimension": "ROWS",
  "values": [["Closed Won"]]
}
```

**Response:**
```json
{
  "spreadsheetId": "...",
  "updatedRange": "Sheet1!E43",
  "updatedRows": 1,
  "updatedCells": 1
}
```

---

### Batch Update Multiple Ranges
**POST /{spreadsheetId}/values:batchUpdate?valueInputOption=USER_ENTERED**

**Request:**
```json
{
  "valueInputOption": "USER_ENTERED",
  "data": [
    {
      "range": "Sheet1!E43",
      "values": [["Closed Won"]]
    },
    {
      "range": "Sheet1!F43",
      "values": [["Updated via Yappr callback 2026-04-12"]]
    }
  ]
}
```

---

### Get Spreadsheet Metadata (Sheet Names)
**GET /{spreadsheetId}?fields=sheets.properties**

**Response:**
```json
{
  "sheets": [
    {
      "properties": {
        "sheetId": 0,
        "title": "Sheet1",
        "index": 0
      }
    },
    {
      "properties": {
        "sheetId": 123456,
        "title": "Archive",
        "index": 1
      }
    }
  ]
}
```

Use this to find sheet names dynamically when the name may vary.

---

### Clear a Range
**POST /{spreadsheetId}/values/{range}:clear**

Request body: `{}` (empty)

---

### Find Row by Value (Search via Read)
Google Sheets API doesn't have a native search. Read all rows and filter:

```typescript
const rows = await fetch(
  `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A:F`,
  { headers: { Authorization: `Bearer ${token}` } }
).then(r => r.json());

const phoneColIndex = 2; // Column C = index 2
const match = rows.values?.findIndex(row => row[phoneColIndex] === callerPhone);
// match = row index (0-based, including header)
```

## Common Patterns

### Append call result row
```typescript
const row = [
  new Date().toLocaleDateString("en-IL"),  // Date
  callerName,                               // Name
  callerPhone,                              // Phone
  callerEmail || "",                        // Email
  disposition,                             // e.g. "Appointment Set"
  callSummary.slice(0, 500),               // Notes (truncated)
  callDurationSeconds,                     // Duration
  callId,                                  // For reference
];

await fetch(
  `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Sheet1!A:H:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
  {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ values: [row] }),
  }
);
```

## Gotchas & Rate Limits

- **Rate limits**: 300 requests/minute per project, 60 requests/minute per user per project.
- **`valueInputOption=USER_ENTERED`**: Parses values as if typed by a user (dates, numbers formatted correctly). Use `RAW` to store literal strings.
- **Range notation**: `Sheet1!A:F` means all rows in columns A through F. `Sheet1!A1:F1` is the header row only.
- **Sheet must be shared**: The service account email must have at least "Editor" access. Share exactly like sharing with a person.
- **Append vs overwrite**: `:append` always adds new rows. `PUT /values/{range}` overwrites. Don't confuse them.
- **Empty trailing cells**: If your last columns are empty, Google may not include them in the `values` array. Use index access carefully: `row[2] ?? ""`.
- **Hebrew text**: Google Sheets handles RTL text fine. Date formats may need locale handling.
- **Max cells**: 10 million cells per spreadsheet.
