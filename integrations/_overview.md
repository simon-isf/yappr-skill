# Integration Directory — Decision Guide

Use this file to decide which integration docs to open for a given task.

## Use Case → Integration Map

| Use case | Integration file(s) |
|---|---|
| Post-call WhatsApp message to Israeli number | `greenapi-whatsapp.md` |
| Post-call WhatsApp via Meta Business API | `whatsapp-business.md` |
| Book appointment, check calendar availability | `google-calendar.md`, `cal-com.md`, `calendly.md` |
| Book via service-business platform (salons, coaches) | `acuity-scheduling.md`, `mindbody.md`, `booksy.md`, `setmore.md`, `simplybook-me.md` |
| Book via Zoho Bookings (integrated with Zoho CRM) | `zoho-bookings.md` |
| Book via Square ecosystem | `square-appointments.md` |
| Update CRM contact after call | `hubspot.md`, `pipedrive.md`, `zoho-crm.md`, `salesforce.md`, `activecampaign.md`, `freshsales.md`, `copper-crm.md`, `close-crm.md`, `kommo-crm.md`, `intercom.md` |
| Log call to Israeli CRM/ERP | `priority-erp.md`, `kommo-crm.md`, `icount.md` |
| Create CRM deal / pipeline stage | `hubspot.md`, `pipedrive.md`, `salesforce.md`, `close-crm.md`, `kommo-crm.md`, `gohighlevel.md` |
| Add contact to GHL pipeline / trigger marketing workflow | `gohighlevel.md` |
| Enrich or find lead from Apollo.io | `apollo-io.md` |
| Log call outcome as board item | `monday-com.md` |
| Log call to spreadsheet | `google-sheets.md`, `airtable.md` |
| Log call to spreadsheet via Google Forms | `google-forms-sheets.md` |
| Create accounting document / invoice after call | `icount.md`, `green-invoice.md` |
| Create payment link and send to caller | `stripe.md`, `bit-pay.md`, `tranzila.md`, `cardcom.md`, `meshulam.md`, `pelecard.md` |
| Charge card saved from previous interaction | `stripe.md`, `cardcom.md`, `pelecard.md` |
| Receive leads from Facebook Lead Ads form | `facebook-lead-ads.md` |
| Receive leads from LinkedIn Lead Gen Forms | `linkedin-lead-gen.md` |
| Receive leads from TikTok Lead Generation | `tiktok-lead-gen.md` |
| Receive leads from Google Ads lead forms | `google-lead-forms.md` |
| Receive leads from web form | `tally-forms.md`, `typeform.md`, `jotform.md`, `google-forms-sheets.md` |
| Trigger outbound call when form submitted | `tally-forms.md`, `typeform.md`, `jotform.md` + `make-com.md`, `n8n.md`, or `zapier.md` |
| Send follow-up email after call | `resend-email.md`, `sendgrid.md`, `brevo.md` |
| Add contact to email/SMS marketing sequence | `activecampaign.md`, `mailchimp.md`, `klaviyo.md`, `mailerlite.md`, `brevo.md`, `convertkit.md` |
| Notify sales team on Slack | `slack.md` |
| Notify team on Microsoft Teams | `microsoft-teams.md` |
| Notify team on Discord | `discord.md` |
| Send SMS follow-up | `twilio-sms.md`, `vonage-sms.md`, `sinch.md` |
| Connect any third-party tool via visual automation | `make-com.md`, `n8n.md`, `zapier.md`, `pluga.md` |
| Schedule a Zoom meeting after a successful call | `zoom.md` |
| Send post-call Viber message (Israel B2C) | `viber.md` |
| Track customer orders during a call | `woocommerce.md`, `shopify.md` |
| Create Jira ticket from support call | `jira.md` |
| Look up employee before internal HR call | `hibob.md` |
| Trigger Israeli automation (iCount, Green Invoice, Priority) | `pluga.md` |
| Search / enrich contact data by phone or email | `clearbit.md` |
| Create / update Notion page after call | `notion.md` |
| Create task in project management tool | `asana.md`, `clickup.md` |
| Create helpdesk ticket from call | `freshdesk.md`, `zendesk.md`, `intercom.md` |
| Track e-commerce order or customer | `shopify.md` |
| Fetch or update data in a database | `supabase.md` |
| Manage email marketing sequences (email-primary) | `convertkit.md`, `mailerlite.md` |
| Log call activity inside a CRM with email workflows | `keap.md`, `drift.md` |

---

## Integration Files in This Directory

### Messaging & Notifications
- `greenapi-whatsapp.md` — WhatsApp for Israeli market via Green-API
- `whatsapp-business.md` — WhatsApp via Meta Cloud API
- `viber.md` — Viber Business Messages (popular with Israeli B2C)
- `slack.md` — Team notifications
- `discord.md` — Community/team Discord messages
- `microsoft-teams.md` — Microsoft Teams notifications
- `twilio-sms.md` — SMS via Twilio
- `vonage-sms.md` — SMS via Vonage (good Israeli delivery rates)
- `sinch.md` — Bulk SMS via Sinch

### CRM
- `gohighlevel.md` — GoHighLevel (GHL) — contacts, pipelines, workflow automation
- `hubspot.md` — HubSpot contacts, deals, notes
- `pipedrive.md` — Pipedrive persons, deals, activities
- `zoho-crm.md` — Zoho CRM leads and contacts
- `salesforce.md` — Salesforce leads and contacts
- `activecampaign.md` — ActiveCampaign CRM + email automation
- `freshsales.md` — Freshworks CRM (contacts, leads, call activities)
- `copper-crm.md` — Copper CRM (Google Workspace–native)
- `close-crm.md` — Close CRM (sales-focused, call logging)
- `kommo-crm.md` — Kommo (formerly amoCRM) — popular in Israeli market
- `intercom.md` — Intercom (support + sales conversations)
- `apollo-io.md` — Apollo.io (prospecting, enrichment, sequences)
- `keap.md` — Keap (formerly Infusionsoft) — SMB CRM + automation
- `drift.md` — Drift (conversational sales platform)
- `airtable.md` — Airtable base as lightweight CRM or database

### Scheduling
- `google-calendar.md` — Google Calendar events and availability
- `cal-com.md` — Cal.com direct booking API
- `calendly.md` — Calendly scheduling links and event webhooks
- `acuity-scheduling.md` — Acuity (Squarespace) Scheduling — salons, coaches, therapists
- `mindbody.md` — Mindbody — fitness, wellness, beauty studios
- `square-appointments.md` — Square Appointments — Square ecosystem businesses
- `booksy.md` — Booksy — beauty and personal care businesses
- `setmore.md` — Setmore — small service businesses
- `simplybook-me.md` — SimplyBook.me — broad service business platform
- `zoho-bookings.md` — Zoho Bookings — integrated with Zoho CRM/Calendar

### Israeli-Market Platforms
- `greenapi-whatsapp.md` — WhatsApp (preferred channel for Israeli market)
- `bit-pay.md` — Bit (Bank Hapoalim) and PayMe payment links
- `tranzila.md` — Tranzila payment gateway (Israeli market)
- `cardcom.md` — Cardcom payment gateway (widely used Israeli acquirer)
- `meshulam.md` — Meshulam payment links and recurring billing
- `pelecard.md` — Pelecard payment gateway (POS + e-commerce)
- `icount.md` — iCount — Israeli accounting, invoicing, receipts
- `green-invoice.md` — Green Invoice (חשבונית ירוקה) — most popular Israeli digital invoicing
- `priority-erp.md` — Priority ERP — Israeli enterprise resource planning
- `kommo-crm.md` — Kommo CRM — popular for Israeli SMBs
- `pluga.md` — Pluga — Israeli automation platform (native Israeli software integrations)
- `woocommerce.md` — WooCommerce — dominant Israeli e-commerce platform
- `viber.md` — Viber — popular messaging channel for Israeli B2C

### Payments
- `stripe.md` — Stripe — payment links, charges, invoices (global)
- `bit-pay.md` — Bit / PayMe — Israeli payment links
- `tranzila.md` — Tranzila — Israeli payment gateway
- `cardcom.md` — Cardcom — Israeli payment gateway, token charging
- `meshulam.md` — Meshulam — Israeli payment links and subscriptions
- `pelecard.md` — Pelecard — Israeli POS and e-commerce payments

### Data / Spreadsheets
- `google-sheets.md` — Append rows, update cells
- `google-forms-sheets.md` — Google Forms webhook → Sheets (Apps Script + polling)
- `notion.md` — Notion database pages and blocks

### Lead Sources / Forms
- `facebook-lead-ads.md` — Facebook Lead Ads webhook
- `tally-forms.md` — Tally form webhook
- `typeform.md` — Typeform webhook
- `jotform.md` — JotForm webhook receiver
- `google-lead-forms.md` — Google Ads lead form extensions webhook
- `linkedin-lead-gen.md` — LinkedIn Lead Gen Forms webhook
- `tiktok-lead-gen.md` — TikTok Lead Generation webhook

### Email & Marketing Automation
- `resend-email.md` — Transactional email via Resend
- `sendgrid.md` — Transactional email via SendGrid
- `mailchimp.md` — Email marketing lists
- `activecampaign.md` — Email + CRM sequences
- `klaviyo.md` — Klaviyo — e-commerce email/SMS marketing
- `mailerlite.md` — MailerLite — simple email automation
- `brevo.md` — Brevo (formerly Sendinblue) — email + SMS
- `convertkit.md` — ConvertKit — creator/email-primary sequences

### Automation Platforms
- `make-com.md` — Make.com (receive/send Yappr webhooks)
- `n8n.md` — n8n HTTP Request and webhook patterns
- `zapier.md` — Zapier Catch Hook and Webhooks by Zapier patterns
- `pluga.md` — Pluga — Israeli automation platform (native iCount, Green Invoice, Priority integrations)

### Enrichment
- `clearbit.md` — Company and person data enrichment

### Helpdesk / Support
- `freshdesk.md` — Freshdesk — tickets, contacts, private notes
- `zendesk.md` — Zendesk — tickets, user upsert, internal notes

### E-commerce
- `shopify.md` — Shopify orders, customers
- `woocommerce.md` — WooCommerce — order/customer lookup and update (WordPress)

### Project Management
- `asana.md` — Asana tasks
- `clickup.md` — ClickUp tasks
- `jira.md` — Jira (Atlassian) — issue creation, comments, status transitions

### Meetings
- `zoom.md` — Zoom — create and send meeting links after a successful call

### HR
- `hibob.md` — HiBob (Bob) — employee lookup and task creation (Israeli HR platform)

### Database
- `supabase.md` — Supabase REST / RPC calls from workflows
