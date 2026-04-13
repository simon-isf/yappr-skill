# Notion

> **Use in Yappr context**: Log call results as new pages in a Notion database, update existing contact pages with call outcomes, and create follow-up task pages.

## Authentication

- Create Integration: Notion → Settings → Integrations → New integration
- Copy Internal Integration Token: `secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
- Share database with integration: Open database in Notion → ··· → Connections → Add integration
- Pass as: `Authorization: Bearer secret_xxx`

## Base URL

```
https://api.notion.com/v1
```

**Required header on all requests:**
```
Notion-Version: 2022-06-28
Authorization: Bearer secret_xxx
Content-Type: application/json
```

## Key Endpoints

### Query Database
**POST /databases/{database_id}/query**

**Request (no filter — get all):**
```json
{
  "page_size": 50
}
```

**Request (filter by phone property):**
```json
{
  "filter": {
    "property": "Phone",
    "phone_number": {
      "equals": "+972501234567"
    }
  }
}
```

**Response:**
```json
{
  "results": [
    {
      "id": "page-uuid",
      "properties": {
        "Name": {
          "title": [{ "text": { "content": "David Cohen" } }]
        },
        "Phone": {
          "phone_number": "+972501234567"
        },
        "Status": {
          "select": { "name": "New Lead" }
        }
      }
    }
  ],
  "has_more": false
}
```

---

### Create Page in Database
**POST /pages**

**Request:**
```json
{
  "parent": { "database_id": "your-database-id-here" },
  "properties": {
    "Name": {
      "title": [{ "text": { "content": "David Cohen" } }]
    },
    "Phone": {
      "phone_number": "+972501234567"
    },
    "Email": {
      "email": "david@example.com"
    },
    "Status": {
      "select": { "name": "Appointment Set" }
    },
    "Call Date": {
      "date": { "start": "2026-04-11" }
    },
    "Notes": {
      "rich_text": [{ "text": { "content": "Interested in Business plan. Appointment booked April 15." } }]
    }
  }
}
```

**Response:**
```json
{
  "id": "new-page-uuid",
  "url": "https://www.notion.so/David-Cohen-new-page-uuid",
  "properties": { ... }
}
```

---

### Update Page Properties
**PATCH /pages/{page_id}**

```json
{
  "properties": {
    "Status": {
      "select": { "name": "Contacted" }
    },
    "Notes": {
      "rich_text": [{ "text": { "content": "Follow-up scheduled for April 16." } }]
    }
  }
}
```

---

### Append Block to Page (Add content)
**PATCH /blocks/{page_id}/children**

```json
{
  "children": [
    {
      "object": "block",
      "type": "heading_2",
      "heading_2": {
        "rich_text": [{ "text": { "content": "Call Summary — April 11, 2026" } }]
      }
    },
    {
      "object": "block",
      "type": "paragraph",
      "paragraph": {
        "rich_text": [{ "text": { "content": "Duration: 3 minutes 12 seconds\nDisposition: Appointment Set\n\nCustomer expressed strong interest in the Business plan." } }]
      }
    },
    {
      "object": "block",
      "type": "divider",
      "divider": {}
    }
  ]
}
```

---

### Get Database Schema (to know property names)
**GET /databases/{database_id}**

**Response:**
```json
{
  "id": "database-uuid",
  "title": [{ "text": { "content": "CRM Leads" } }],
  "properties": {
    "Name": { "type": "title" },
    "Phone": { "type": "phone_number" },
    "Status": {
      "type": "select",
      "select": {
        "options": [
          { "name": "New Lead", "color": "blue" },
          { "name": "Contacted", "color": "yellow" },
          { "name": "Appointment Set", "color": "green" }
        ]
      }
    }
  }
}
```

---

### Create Database (setup)
**POST /databases**

```json
{
  "parent": { "page_id": "parent-page-id" },
  "title": [{ "text": { "content": "Yappr Call Logs" } }],
  "properties": {
    "Name": { "title": {} },
    "Phone": { "phone_number": {} },
    "Disposition": { "select": { "options": [
      { "name": "Appointment Set", "color": "green" },
      { "name": "Not Interested", "color": "red" }
    ]}},
    "Call Date": { "date": {} },
    "Notes": { "rich_text": {} }
  }
}
```

## Common Patterns

### Log call to Notion database
```typescript
const headers = {
  Authorization: `Bearer ${Deno.env.get("NOTION_TOKEN")}`,
  "Notion-Version": "2022-06-28",
  "Content-Type": "application/json",
};

// 1. Check if contact already exists
const query = await fetch(`https://api.notion.com/v1/databases/${DB_ID}/query`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    filter: { property: "Phone", phone_number: { equals: callerPhone } },
  }),
}).then(r => r.json());

const existingPage = query.results?.[0];

if (existingPage) {
  // 2a. Update existing page
  await fetch(`https://api.notion.com/v1/pages/${existingPage.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      properties: {
        Status: { select: { name: disposition } },
      },
    }),
  });

  // Append call block
  await fetch(`https://api.notion.com/v1/blocks/${existingPage.id}/children`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      children: [{
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [{ text: { content: `[${new Date().toLocaleDateString("en-IL")}] ${disposition}: ${callSummary}` } }],
        },
      }],
    }),
  });
} else {
  // 2b. Create new page
  await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers,
    body: JSON.stringify({
      parent: { database_id: DB_ID },
      properties: {
        Name: { title: [{ text: { content: callerName } }] },
        Phone: { phone_number: callerPhone },
        Status: { select: { name: disposition } },
        "Call Date": { date: { start: new Date().toISOString().split("T")[0] } },
        Notes: { rich_text: [{ text: { content: callSummary } }] },
      },
    }),
  });
}
```

## Gotchas & Rate Limits

- **Rate limits**: 3 requests/second average. Burst of ~10/second. Don't hammer the API.
- **Database must be shared**: Integration must be connected to the database (Share → Add connections). Without this, all requests return 404.
- **Property types are strict**: Passing text to a `select` property or a string to `title` won't work. Match the property type exactly.
- **`title` type**: Every Notion database has exactly one title property (the "Name" column). It uses the `title` type, not `rich_text`.
- **Database ID format**: Can be found in the URL: `https://notion.so/{workspace}/{DATABASE_ID}?v=...`. Remove hyphens if needed — the API accepts both formats.
- **`Notion-Version` header**: Required on every request. Use `2022-06-28`.
- **Select options must exist**: If you pass a select value that doesn't exist in the database schema, Notion auto-creates it. This is usually fine but can clutter your select options.
- **Rich text vs plain text**: Properties like Notes use `rich_text` arrays. Always wrap content: `[{ "text": { "content": "your text" } }]`.
