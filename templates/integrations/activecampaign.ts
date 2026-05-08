// activecampaign.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/activecampaign.md

// ---------------------------------------------------------------------------
// Request / Response interfaces
// ---------------------------------------------------------------------------

export interface ACFieldValue {
  field: string;
  value: string;
}

export interface ACContact {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
}

export interface ACContactResponse {
  contact: ACContact;
}

export interface ACContactsResponse {
  contacts: ACContact[];
}

export interface ACSyncContactParams {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  fieldValues?: ACFieldValue[];
}

export interface ACTag {
  id: string;
  tag: string;
  tagType: string;
  description?: string;
}

export interface ACTagResponse {
  tag: ACTag;
}

export interface ACTagsResponse {
  tags: ACTag[];
}

export interface ACCreateTagParams {
  tag: string;
  tagType: "contact";
  description?: string;
}

export interface ACContactTag {
  id: string;
  contact: string;
  tag: string;
}

export interface ACContactTagResponse {
  contactTag: ACContactTag;
}

export interface ACFieldValueRecord {
  id: string;
  contact: string;
  field: string;
  value: string;
}

export interface ACFieldValueResponse {
  fieldValue: ACFieldValueRecord;
}

export interface ACCustomField {
  id: string;
  title: string;
  perstag: string;
  type: string;
}

export interface ACCustomFieldsResponse {
  fields: ACCustomField[];
}

export interface ACContactList {
  id: string;
  list: string;
  contact: string;
  status: string;
}

export interface ACContactListResponse {
  contactList: ACContactList;
}

export interface ACAutomation {
  id: string;
  name: string;
}

export interface ACAutomationsResponse {
  automations: ACAutomation[];
}

export interface ACContactAutomation {
  id: string;
  contact: string;
  automation: string;
}

export interface ACContactAutomationResponse {
  contactAutomation: ACContactAutomation;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class ACError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`ActiveCampaign ${status}: ${message}`);
    this.name = "ACError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class ACClient {
  readonly baseUrl: string;

  constructor(
    /** Full account URL, e.g. "https://myaccount.api-us1.com" */
    accountUrl: string,
    private readonly apiKey: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {
    this.baseUrl = `${accountUrl.replace(/\/$/, "")}/api/3`;
  }

  private get headers(): HeadersInit {
    return {
      "Api-Token": this.apiKey,
      "Content-Type": "application/json",
    };
  }

  // POST /contact/sync — upsert by email
  async syncContact(params: ACSyncContactParams): Promise<ACContact> {
    const res = await this.fetchFn(`${this.baseUrl}/contact/sync`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ contact: params }),
    });
    if (!res.ok) throw new ACError(res.status, await res.text());
    const data = (await res.json()) as ACContactResponse;
    return data.contact;
  }

  // GET /contacts?email={email}
  async searchContactsByEmail(email: string): Promise<ACContact[]> {
    const url = new URL(`${this.baseUrl}/contacts`);
    url.searchParams.set("email", email);
    const res = await this.fetchFn(url.toString(), {
      method: "GET",
      headers: this.headers,
    });
    if (!res.ok) throw new ACError(res.status, await res.text());
    const data = (await res.json()) as ACContactsResponse;
    return data.contacts;
  }

  // GET /contacts?search={phone}
  async searchContactsByPhone(phone: string): Promise<ACContact[]> {
    const url = new URL(`${this.baseUrl}/contacts`);
    url.searchParams.set("search", phone);
    const res = await this.fetchFn(url.toString(), {
      method: "GET",
      headers: this.headers,
    });
    if (!res.ok) throw new ACError(res.status, await res.text());
    const data = (await res.json()) as ACContactsResponse;
    return data.contacts;
  }

  // POST /contactTags
  async addTagToContact(contactId: string, tagId: string): Promise<ACContactTag> {
    const res = await this.fetchFn(`${this.baseUrl}/contactTags`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ contactTag: { contact: contactId, tag: tagId } }),
    });
    if (!res.ok) throw new ACError(res.status, await res.text());
    const data = (await res.json()) as ACContactTagResponse;
    return data.contactTag;
  }

  // GET /tags?search={search}
  async getTags(search?: string): Promise<ACTag[]> {
    const url = new URL(`${this.baseUrl}/tags`);
    if (search) url.searchParams.set("search", search);
    const res = await this.fetchFn(url.toString(), {
      method: "GET",
      headers: this.headers,
    });
    if (!res.ok) throw new ACError(res.status, await res.text());
    const data = (await res.json()) as ACTagsResponse;
    return data.tags;
  }

  // POST /tags
  async createTag(params: ACCreateTagParams): Promise<ACTag> {
    const res = await this.fetchFn(`${this.baseUrl}/tags`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ tag: params }),
    });
    if (!res.ok) throw new ACError(res.status, await res.text());
    const data = (await res.json()) as ACTagResponse;
    return data.tag;
  }

  // POST /fieldValues
  async setFieldValue(
    contactId: string,
    fieldId: string,
    value: string,
  ): Promise<ACFieldValueRecord> {
    const res = await this.fetchFn(`${this.baseUrl}/fieldValues`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        fieldValue: { contact: contactId, field: fieldId, value },
      }),
    });
    if (!res.ok) throw new ACError(res.status, await res.text());
    const data = (await res.json()) as ACFieldValueResponse;
    return data.fieldValue;
  }

  // POST /contactLists
  async addContactToList(
    contactId: string,
    listId: string,
    status: "1" | "2" = "1",
  ): Promise<ACContactList> {
    const res = await this.fetchFn(`${this.baseUrl}/contactLists`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        contactList: { list: listId, contact: contactId, status },
      }),
    });
    if (!res.ok) throw new ACError(res.status, await res.text());
    const data = (await res.json()) as ACContactListResponse;
    return data.contactList;
  }

  // POST /contactAutomations
  async triggerAutomation(
    contactId: string,
    automationId: string,
  ): Promise<ACContactAutomation> {
    const res = await this.fetchFn(`${this.baseUrl}/contactAutomations`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        contactAutomation: { contact: contactId, automation: automationId },
      }),
    });
    if (!res.ok) throw new ACError(res.status, await res.text());
    const data = (await res.json()) as ACContactAutomationResponse;
    return data.contactAutomation;
  }

  // GET /fields
  async getCustomFields(): Promise<ACCustomField[]> {
    const res = await this.fetchFn(`${this.baseUrl}/fields`, {
      method: "GET",
      headers: this.headers,
    });
    if (!res.ok) throw new ACError(res.status, await res.text());
    const data = (await res.json()) as ACCustomFieldsResponse;
    return data.fields;
  }

  // GET /automations
  async getAutomations(): Promise<ACAutomation[]> {
    const res = await this.fetchFn(`${this.baseUrl}/automations`, {
      method: "GET",
      headers: this.headers,
    });
    if (!res.ok) throw new ACError(res.status, await res.text());
    const data = (await res.json()) as ACAutomationsResponse;
    return data.automations;
  }
}
