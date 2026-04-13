# Klaviyo

> **Use in Yappr context**: Add or update a customer profile after a call and trigger email/SMS flows based on call disposition.

## Authentication

All requests require two headers:

```
Authorization: Klaviyo-API-Key {api_key}
revision: 2024-02-15
```

The `revision` header is **mandatory** — requests without it return 400. Get your private API key from Klaviyo → Settings → API Keys → Create Private API Key. Scope needed: `profiles:write`, `events:write`.

## Base URL

```
https://a.klaviyo.com/api
```

## Key Endpoints

### POST /profiles — Create or update profile

```json
{
  "data": {
    "type": "profile",
    "attributes": {
      "email": "david@example.com",
      "phone_number": "+972501234567",
      "first_name": "David",
      "last_name": "Cohen",
      "properties": {
        "last_call_disposition": "appointment_set",
        "last_call_at": "2024-02-15T10:30:00Z",
        "agent_id": "agent_abc123"
      }
    }
  }
}
```

Response: `200 OK` if profile already exists (upserted by email or phone), `201 Created` if new.

### GET /profiles?filter=equals(phone_number,"+972501234567") — Find profile by phone

```
GET /profiles?filter=equals(phone_number,%22%2B972501234567%22)
```

Response:

```json
{
  "data": [
    {
      "type": "profile",
      "id": "01HXYZ...",
      "attributes": {
        "email": "david@example.com",
        "phone_number": "+972501234567",
        "properties": { "last_call_disposition": "callback_requested" }
      }
    }
  ]
}
```

Returns empty `data: []` if not found.

### POST /events — Track a custom event

```json
{
  "data": {
    "type": "event",
    "attributes": {
      "profile": {
        "data": {
          "type": "profile",
          "attributes": {
            "phone_number": "+972501234567",
            "email": "david@example.com"
          }
        }
      },
      "metric": {
        "data": {
          "type": "metric",
          "attributes": {
            "name": "Call Completed"
          }
        }
      },
      "properties": {
        "disposition": "appointment_set",
        "call_duration_seconds": 187,
        "agent_name": "Sales Bot",
        "recording_url": "https://..."
      },
      "time": "2024-02-15T10:30:00Z",
      "value": 1
    }
  }
}
```

Response: `202 Accepted` (async processing).

### POST /profile-import — Bulk upsert profiles

```json
{
  "data": {
    "type": "profile-bulk-import-job",
    "attributes": {
      "profiles": {
        "data": [
          {
            "type": "profile",
            "attributes": {
              "email": "user1@example.com",
              "phone_number": "+972501111111",
              "properties": { "last_call_disposition": "interested" }
            }
          },
          {
            "type": "profile",
            "attributes": {
              "email": "user2@example.com",
              "phone_number": "+972502222222",
              "properties": { "last_call_disposition": "not_interested" }
            }
          }
        ]
      }
    }
  }
}
```

### GET /metrics — List metrics (find your event metric ID)

```
GET /metrics
```

Returns all custom and built-in metrics. Use to find the ID of your "Call Completed" metric for flow triggers.

### POST /lists/{list_id}/relationships/profiles — Add profile to list

```json
{
  "data": [
    { "type": "profile", "id": "01HXYZ..." }
  ]
}
```

## Common Patterns

### Post-call profile upsert and event tracking

```typescript
const KLAVIYO_API_KEY = Deno.env.get("KLAVIYO_API_KEY")!;
const REVISION = "2024-02-15";

const klaviyoHeaders = {
  "Authorization": `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
  "revision": REVISION,
  "Content-Type": "application/json",
  "Accept": "application/json",
};

async function upsertProfileAndTrackCall(params: {
  phone: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  disposition: string;
  callDurationSeconds: number;
}) {
  const { phone, email, firstName, lastName, disposition, callDurationSeconds } = params;

  // 1. Upsert profile
  const profileRes = await fetch("https://a.klaviyo.com/api/profiles", {
    method: "POST",
    headers: klaviyoHeaders,
    body: JSON.stringify({
      data: {
        type: "profile",
        attributes: {
          ...(email && { email }),
          phone_number: phone,
          ...(firstName && { first_name: firstName }),
          ...(lastName && { last_name: lastName }),
          properties: {
            last_call_disposition: disposition,
            last_call_at: new Date().toISOString(),
          },
        },
      },
    }),
  });

  if (!profileRes.ok && profileRes.status !== 409) {
    throw new Error(`Klaviyo profile upsert failed: ${profileRes.status}`);
  }

  // 2. Track event (triggers flows)
  const eventRes = await fetch("https://a.klaviyo.com/api/events", {
    method: "POST",
    headers: klaviyoHeaders,
    body: JSON.stringify({
      data: {
        type: "event",
        attributes: {
          profile: {
            data: {
              type: "profile",
              attributes: {
                phone_number: phone,
                ...(email && { email }),
              },
            },
          },
          metric: {
            data: {
              type: "metric",
              attributes: { name: "Call Completed" },
            },
          },
          properties: {
            disposition,
            call_duration_seconds: callDurationSeconds,
          },
          time: new Date().toISOString(),
        },
      },
    }),
  });

  if (!eventRes.ok) {
    throw new Error(`Klaviyo event tracking failed: ${eventRes.status}`);
  }
}
```

### Triggering flows from call events

In Klaviyo: Flows → Create Flow → "When someone does something" → select metric "Call Completed" → add filter `disposition equals appointment_set` → add email/SMS action.

This lets you automatically send a confirmation email or SMS whenever a Yappr agent sets an appointment.

## Gotchas & Rate Limits

- **`revision` header is required** on every request — missing it returns `400 Bad Request`.
- **Phone must be E.164** (`+972...`). Klaviyo rejects local formats like `05XXXXXXXX`.
- **Upsert conflict**: If a profile with that phone/email already exists, Klaviyo returns `409 Conflict` with the existing profile ID in the response body — not an error you need to retry.
- **Rate limits**: 75 requests/second for profiles, 700 requests/second for events (burst). For bulk operations use `/profile-import` instead of looping POST /profiles.
- **Event processing is async**: `202 Accepted` means queued, not processed. Flow triggers fire within seconds but are not instantaneous.
- **List vs. segment**: Lists are static (manual/API adds). Segments are dynamic (auto-computed). For post-call routing use lists; Klaviyo flows can use either as audience filters.
- **SMS requires consent**: Adding a phone number does not grant SMS consent. Set `sms_consent` property or use Klaviyo consent forms — do not SMS unconsented contacts.
