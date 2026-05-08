# Monday.com

> **Use in Yappr context**: Log call outcomes as board items, update lead status columns, and create follow-up tasks on a Monday.com sales or operations board.

## Authentication

- Get API key: Profile (avatar) → API → Copy personal API token
- Pass as `Authorization: Bearer <token>` header
- All operations use a single GraphQL endpoint

## Base URL

```
https://api.monday.com/v2
```

## Key Endpoints

All requests are `POST /v2` with a `query` field containing a GraphQL string.

**Headers for all requests:**
```
Authorization: Bearer eyJh...
Content-Type: application/json
API-Version: 2023-10
```

---

### Get Boards
**POST /v2**

**Request:**
```json
{
  "query": "{ boards(limit: 20) { id name description } }"
}
```

**Response:**
```json
{
  "data": {
    "boards": [
      { "id": "1234567890", "name": "Sales Pipeline", "description": "" }
    ]
  }
}
```

---

### Get Board Columns
**POST /v2**

**Request:**
```json
{
  "query": "{ boards(ids: [1234567890]) { columns { id title type } } }"
}
```

**Response:**
```json
{
  "data": {
    "boards": [
      {
        "columns": [
          { "id": "name", "title": "Name", "type": "name" },
          { "id": "status", "title": "Status", "type": "color" },
          { "id": "phone", "title": "Phone", "type": "phone" }
        ]
      }
    ]
  }
}
```

Get column IDs before creating items — you need them for `column_values`.

---

### Create Item
**POST /v2**

**Request:**
```json
{
  "query": "mutation { create_item(board_id: 1234567890, group_id: \"new_leads\", item_name: \"David Cohen\", column_values: \"{\\\"phone\\\": {\\\"phone\\\": \\\"+972501234567\\\", \\\"countryShortName\\\": \\\"IL\\\"}, \\\"status\\\": {\\\"label\\\": \\\"New Lead\\\"}}\") { id } }"
}
```

Or using variables (cleaner):

**Request:**
```json
{
  "query": "mutation CreateItem($boardId: ID!, $groupId: String!, $itemName: String!, $columnValues: JSON!) { create_item(board_id: $boardId, group_id: $groupId, item_name: $itemName, column_values: $columnValues) { id name } }",
  "variables": {
    "boardId": "1234567890",
    "groupId": "new_leads",
    "itemName": "David Cohen",
    "columnValues": "{\"phone\": {\"phone\": \"+972501234567\", \"countryShortName\": \"IL\"}, \"status\": {\"label\": \"New Lead\"}}"
  }
}
```

**Response:**
```json
{
  "data": {
    "create_item": {
      "id": "9876543210",
      "name": "David Cohen"
    }
  }
}
```

---

### Update Column Value
**POST /v2**

**Request:**
```json
{
  "query": "mutation { change_column_value(board_id: 1234567890, item_id: 9876543210, column_id: \"status\", value: \"{\\\"label\\\": \\\"Appointment Set\\\"}\") { id } }"
}
```

Using variables:
```json
{
  "query": "mutation UpdateColumn($boardId: ID!, $itemId: ID!, $columnId: String!, $value: JSON!) { change_column_value(board_id: $boardId, item_id: $itemId, column_id: $columnId, value: $value) { id } }",
  "variables": {
    "boardId": "1234567890",
    "itemId": "9876543210",
    "columnId": "status",
    "value": "{\"label\": \"Appointment Set\"}"
  }
}
```

---

### Search Items by Column Value
**POST /v2**

**Request:**
```json
{
  "query": "{ items_page_by_column_values(board_id: 1234567890, limit: 1, columns: [{column_id: \"phone\", column_values: [\"+972501234567\"]}]) { items { id name column_values { id text value } } } }"
}
```

**Response:**
```json
{
  "data": {
    "items_page_by_column_values": {
      "items": [
        {
          "id": "9876543210",
          "name": "David Cohen",
          "column_values": [
            { "id": "status", "text": "New Lead", "value": "{\"label\":\"New Lead\"}" }
          ]
        }
      ]
    }
  }
}
```

---

### Add Update (Comment/Note) to Item
**POST /v2**

**Request:**
```json
{
  "query": "mutation { create_update(item_id: 9876543210, body: \"Call completed. Customer interested in Plan B. Disposition: Appointment Set.\") { id } }"
}
```

---

### Create Subitem
**POST /v2**

```json
{
  "query": "mutation { create_subitem(parent_item_id: 9876543210, item_name: \"Follow up call — April 15\") { id board { id } } }"
}
```

## Common Patterns

### Create lead item after call
```typescript
const columnValues = JSON.stringify({
  phone: { phone: callerPhone, countryShortName: "IL" },
  status: { label: disposition },
  text: callSummary, // text column id varies — check your board
});

const res = await fetch("https://api.monday.com/v2", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "API-Version": "2023-10",
  },
  body: JSON.stringify({
    query: `mutation ($boardId: ID!, $itemName: String!, $colVals: JSON!) {
      create_item(board_id: $boardId, item_name: $itemName, column_values: $colVals) { id }
    }`,
    variables: { boardId: BOARD_ID, itemName: callerName, colVals: columnValues },
  }),
}).then(r => r.json());

const itemId = res.data.create_item.id;
```

## Gotchas & Rate Limits

- **Column values are double-encoded**: `column_values` is a JSON string, and each column's value is also a JSON object encoded as a string inside it. Use `JSON.stringify()` on the inner object.
- **Column IDs vs titles**: Use `id` (e.g. `"status"`, `"phone"`) not the display title. Fetch column IDs once and cache them.
- **Status column**: Value format is `{"label": "Status Label"}`. The label must match exactly (case-sensitive) a label defined on the board.
- **Phone column**: Format is `{"phone": "+972501234567", "countryShortName": "IL"}`.
- **Rate limits**: 5,000 requests/minute for most plans. Complex queries count as multiple requests based on complexity score.
- **API version**: Always pass `API-Version: 2023-10` header to avoid breaking changes.
- **Board IDs are strings in GraphQL** but may look like numbers. Pass as strings in variables.
