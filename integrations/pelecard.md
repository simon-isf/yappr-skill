# Pelecard

> **Use in Yappr context**: Generate a payment link during or after a call to send the caller via WhatsApp, charge a saved card token for a returning customer, or query transaction status to confirm payment before fulfillment.

## Authentication
All requests include terminal credentials in the JSON request body — there is no separate auth handshake. Obtain credentials from the Pelecard merchant portal.

```json
{
  "terminal": "your_terminal_number",
  "user": "your_username",
  "password": "your_password"
}
```

Response code `000` always means success. Any other code is an error — see the error message in the response.

## Base URL
`https://gateway20.pelecard.biz/PaymentGW`

All endpoints use `Content-Type: application/json` and `POST` method.

## Key Endpoints

### Create a Payment Page Session (Payment Link)
**POST /Init**

Creates a hosted payment page session and returns a redirect URL. Send this URL to the customer via WhatsApp. The session expires after a configurable timeout (default 30 minutes).

**Request**
```json
{
  "terminal": "1234567",
  "user": "merchant_user",
  "password": "merchant_pass",
  "params": {
    "TransactionSum": "15000",
    "Currency": "1",
    "MaxPayments": "1",
    "GoodURL": "https://yourapp.com/payment-success",
    "ErrorURL": "https://yourapp.com/payment-error",
    "CustomerName": "David Levi",
    "PhoneNumber": "0501234567",
    "ProductName": "Monthly subscription",
    "HideCardOwnerFields": "1",
    "Language": "HE",
    "CreateInvoice": "0",
    "FreeTotal": "0"
  }
}
```

**Field notes**:
- `TransactionSum`: amount in agorot (1/100 of a shekel). `15000` = ₪150.00
- `Currency`: `1` = ILS, `2` = USD, `978` = EUR
- `Language`: `HE` for Hebrew payment page, `EN` for English
- `MaxPayments`: `1` for full charge, `2`–`12` for installments

**Response**
```json
{
  "Error": {
    "ErrCode": "000",
    "ErrMsg": ""
  },
  "URL": "https://gateway20.pelecard.biz/PaymentPage/?transactionId=abc123xyz",
  "TransactionID": "abc123xyz"
}
```

If `ErrCode` is not `000`, `URL` will be empty and `ErrMsg` will describe the error.

### Get Transaction Status
**POST /GetTransaction**

Query the result of a completed payment page transaction using the `TransactionID` from `/Init`.

**Request**
```json
{
  "terminal": "1234567",
  "user": "merchant_user",
  "password": "merchant_pass",
  "params": {
    "TransactionID": "abc123xyz"
  }
}
```

**Response**
```json
{
  "Error": {
    "ErrCode": "000",
    "ErrMsg": ""
  },
  "ResultData": {
    "DebitTotal": "15000",
    "Currency": "1",
    "VoucherId": "9876543",
    "CardOwnerID": "XXXXXXXXX",
    "CardNumber": "XXXXXXXXXXXX4567",
    "CardExpiry": "0128",
    "AuthorizationNumber": "012345",
    "CreditType": "1",
    "Payments": "1",
    "FirstPaymentSum": "15000",
    "PeriodicalPaymentSum": "0",
    "ConfirmationKey": "abc123",
    "CreditCardCompanyId": "1",
    "CreditCardCompanyName": "Visa",
    "StatusCode": "000"
  }
}
```

`StatusCode` `000` in `ResultData` = transaction approved. `StatusCode` `001` = pending. `StatusCode` `002` = declined.

### Charge a Saved Token (J4 Recurring)
**POST /DebitRegularType**

Charge a tokenized card without requiring the customer to re-enter card details. The token (`ConfirmationKey`) is obtained from a previous transaction's response.

**Request**
```json
{
  "terminal": "1234567",
  "user": "merchant_user",
  "password": "merchant_pass",
  "params": {
    "ConfirmationKey": "abc123",
    "TotalX100": "9900",
    "Currency": "1",
    "MaxPayments": "1",
    "CreditType": "6",
    "AuthNumber": "012345",
    "CardNumber": "XXXXXXXXXXXX4567",
    "CardExpiry": "0128",
    "CvvResult": "1"
  }
}
```

**Response**
```json
{
  "Error": {
    "ErrCode": "000",
    "ErrMsg": ""
  },
  "ResultData": {
    "VoucherId": "9876544",
    "AuthorizationNumber": "012346",
    "DebitTotal": "9900",
    "StatusCode": "000"
  }
}
```

### Create a Refund
**POST /RefundToCard**

Refund a previous transaction using its `VoucherId`.

**Request**
```json
{
  "terminal": "1234567",
  "user": "merchant_user",
  "password": "merchant_pass",
  "params": {
    "VoucherId": "9876543",
    "TotalX100": "15000",
    "Currency": "1"
  }
}
```

**Response**
```json
{
  "Error": {
    "ErrCode": "000",
    "ErrMsg": ""
  },
  "ResultData": {
    "RefundVoucherId": "9876599",
    "StatusCode": "000"
  }
}
```

### Validate Terminal Connectivity
**POST /VerifyPaymentPageField**

Lightweight check that your terminal credentials are valid before processing calls.

**Request**
```json
{
  "terminal": "1234567",
  "user": "merchant_user",
  "password": "merchant_pass",
  "params": {}
}
```

**Response**
```json
{
  "Error": {
    "ErrCode": "000",
    "ErrMsg": ""
  }
}
```

## Common Patterns

### Post-call: generate and send payment link
```typescript
// supabase/functions/call-analyzed/index.ts
// After a call results in "Payment Required" disposition:
// 1. Create Pelecard payment session
// 2. Send link via WhatsApp (GreenAPI)

const PELECARD_TERMINAL = Deno.env.get("PELECARD_TERMINAL")!;
const PELECARD_USER = Deno.env.get("PELECARD_USER")!;
const PELECARD_PASSWORD = Deno.env.get("PELECARD_PASSWORD")!;

interface PaymentLinkOptions {
  amountAgorot: number;       // e.g. 15000 for ₪150
  customerName: string;
  phone: string;
  description: string;
  maxPayments?: number;
  language?: "HE" | "EN";
}

async function createPaymentLink(opts: PaymentLinkOptions): Promise<string> {
  const response = await fetch("https://gateway20.pelecard.biz/PaymentGW/Init", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      terminal: PELECARD_TERMINAL,
      user: PELECARD_USER,
      password: PELECARD_PASSWORD,
      params: {
        TransactionSum: String(opts.amountAgorot),
        Currency: "1",
        MaxPayments: String(opts.maxPayments ?? 1),
        GoodURL: `${Deno.env.get("APP_URL")}/payment-success`,
        ErrorURL: `${Deno.env.get("APP_URL")}/payment-error`,
        CustomerName: opts.customerName,
        PhoneNumber: opts.phone.replace("+972", "0"),
        ProductName: opts.description,
        Language: opts.language ?? "HE",
        HideCardOwnerFields: "1",
        FreeTotal: "0",
      },
    }),
  });

  const data = await response.json();

  if (data.Error?.ErrCode !== "000") {
    throw new Error(`Pelecard Init failed: ${data.Error?.ErrCode} — ${data.Error?.ErrMsg}`);
  }

  return data.URL as string;
}

// Poll transaction status after customer completes payment
async function checkPaymentStatus(transactionId: string): Promise<"approved" | "pending" | "declined"> {
  const response = await fetch("https://gateway20.pelecard.biz/PaymentGW/GetTransaction", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      terminal: PELECARD_TERMINAL,
      user: PELECARD_USER,
      password: PELECARD_PASSWORD,
      params: { TransactionID: transactionId },
    }),
  });

  const data = await response.json();

  if (data.Error?.ErrCode !== "000") {
    throw new Error(`GetTransaction failed: ${data.Error?.ErrCode}`);
  }

  const statusCode = data.ResultData?.StatusCode;
  if (statusCode === "000") return "approved";
  if (statusCode === "001") return "pending";
  return "declined";
}
```

## Gotchas & Rate Limits

- `ErrCode: "000"` always means success. All other codes are errors regardless of HTTP status (which is always 200 for well-formed requests).
- All monetary amounts are in **agorot** (1/100 of a shekel). ₪150 = `15000`. Sending `150` will charge ₪1.50 — double-check this before going live.
- Phone numbers must be in local Israeli format (`050XXXXXXX`) without country code or `+`. Strip the `+972` prefix and replace with `0`.
- Payment page sessions expire after 30 minutes by default. Generate the link as close to sending it as possible.
- Hebrew payment page (`Language: "HE"`) is the preferred UX for Israeli customers — the form is right-aligned and in Hebrew.
- The `ConfirmationKey` returned in a transaction is the tokenization key for future charges. Store it securely — it is the equivalent of a stored card credential.
- `CreditType: "6"` is the J4 recurring/token charge type. Using the wrong credit type will cause a decline.
- Pelecard's API is not RESTful — all endpoints are POST, and all responses return HTTP 200 with error information in the JSON body. Always check `ErrCode`, never rely on HTTP status alone.
- No published rate limits. For high-volume use, contact your Pelecard account manager.
- PCI compliance: never log full card numbers or CVV values. `CardNumber` in responses is already masked (e.g., `XXXXXXXXXXXX4567`).
- Pelecard documentation is in Hebrew and available through your merchant portal or account manager. There is no public API reference URL.
