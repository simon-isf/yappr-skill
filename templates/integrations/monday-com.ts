// monday-com.ts — Yappr Agent Builder integration client
// Reference doc: ../../integrations/monday-com.md

// ---------------------------------------------------------------------------
// Request / Response interfaces
// ---------------------------------------------------------------------------

export interface MondayBoard {
  id: string;
  name: string;
  description?: string;
}

export interface MondayColumn {
  id: string;
  title: string;
  type: string;
}

export interface MondayColumnValue {
  id: string;
  text: string;
  value: string;
}

export interface MondayItem {
  id: string;
  name: string;
  column_values?: MondayColumnValue[];
}

export interface MondayUpdate {
  id: string;
}

export interface MondaySubitem {
  id: string;
  board: { id: string };
}

export interface MondayGetBoardsResponse {
  data: { boards: MondayBoard[] };
}

export interface MondayGetBoardColumnsResponse {
  data: { boards: Array<{ columns: MondayColumn[] }> };
}

export interface MondayCreateItemResponse {
  data: { create_item: MondayItem };
}

export interface MondayUpdateColumnResponse {
  data: { change_column_value: { id: string } };
}

export interface MondaySearchItemsResponse {
  data: {
    items_page_by_column_values: { items: MondayItem[] };
  };
}

export interface MondayCreateUpdateResponse {
  data: { create_update: MondayUpdate };
}

export interface MondayCreateSubitemResponse {
  data: { create_subitem: MondaySubitem };
}

export interface MondayGraphQLRequest {
  query: string;
  variables?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// GraphQL query/mutation constants
// ---------------------------------------------------------------------------

export const QUERY_GET_BOARDS = `{ boards(limit: 20) { id name description } }`;

export const QUERY_GET_BOARD_COLUMNS =
  `query GetBoardColumns($ids: [ID!]) { boards(ids: $ids) { columns { id title type } } }`;

export const MUTATION_CREATE_ITEM =
  `mutation CreateItem($boardId: ID!, $groupId: String, $itemName: String!, $columnValues: JSON!) {
    create_item(board_id: $boardId, group_id: $groupId, item_name: $itemName, column_values: $columnValues) {
      id
      name
    }
  }`;

export const MUTATION_UPDATE_COLUMN =
  `mutation UpdateColumn($boardId: ID!, $itemId: ID!, $columnId: String!, $value: JSON!) {
    change_column_value(board_id: $boardId, item_id: $itemId, column_id: $columnId, value: $value) {
      id
    }
  }`;

export const QUERY_SEARCH_ITEMS_BY_COLUMN =
  `query SearchItems($boardId: ID!, $limit: Int!, $columnId: String!, $columnValues: [String!]!) {
    items_page_by_column_values(
      board_id: $boardId
      limit: $limit
      columns: [{ column_id: $columnId, column_values: $columnValues }]
    ) {
      items {
        id
        name
        column_values { id text value }
      }
    }
  }`;

export const MUTATION_CREATE_UPDATE =
  `mutation CreateUpdate($itemId: ID!, $body: String!) {
    create_update(item_id: $itemId, body: $body) {
      id
    }
  }`;

export const MUTATION_CREATE_SUBITEM =
  `mutation CreateSubitem($parentItemId: ID!, $itemName: String!) {
    create_subitem(parent_item_id: $parentItemId, item_name: $itemName) {
      id
      board { id }
    }
  }`;

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class MondayError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`Monday.com ${status}: ${message}`);
    this.name = "MondayError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class MondayClient {
  readonly baseUrl = "https://api.monday.com/v2";

  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  private get headers(): HeadersInit {
    return {
      "Authorization": `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      "API-Version": "2023-10",
    };
  }

  private async gql<T>(request: MondayGraphQLRequest): Promise<T> {
    const res = await this.fetchFn(this.baseUrl, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(request),
    });
    if (!res.ok) throw new MondayError(res.status, await res.text());
    return res.json() as Promise<T>;
  }

  // GET boards (POST /v2 with boards query)
  async getBoards(): Promise<MondayGetBoardsResponse> {
    return this.gql<MondayGetBoardsResponse>({ query: QUERY_GET_BOARDS });
  }

  // GET board columns
  async getBoardColumns(boardId: string): Promise<MondayGetBoardColumnsResponse> {
    return this.gql<MondayGetBoardColumnsResponse>({
      query: QUERY_GET_BOARD_COLUMNS,
      variables: { ids: [boardId] },
    });
  }

  // Create item on a board
  async createItem(params: {
    boardId: string;
    itemName: string;
    columnValues: Record<string, unknown>;
    groupId?: string;
  }): Promise<MondayCreateItemResponse> {
    return this.gql<MondayCreateItemResponse>({
      query: MUTATION_CREATE_ITEM,
      variables: {
        boardId: params.boardId,
        groupId: params.groupId ?? null,
        itemName: params.itemName,
        // column_values must be a JSON string
        columnValues: JSON.stringify(params.columnValues),
      },
    });
  }

  // Update a single column value on an item
  async updateColumnValue(params: {
    boardId: string;
    itemId: string;
    columnId: string;
    value: unknown;
  }): Promise<MondayUpdateColumnResponse> {
    return this.gql<MondayUpdateColumnResponse>({
      query: MUTATION_UPDATE_COLUMN,
      variables: {
        boardId: params.boardId,
        itemId: params.itemId,
        columnId: params.columnId,
        // value must be a JSON string
        value: JSON.stringify(params.value),
      },
    });
  }

  // Search items by a column value
  async searchItemsByColumnValue(params: {
    boardId: string;
    columnId: string;
    columnValues: string[];
    limit?: number;
  }): Promise<MondaySearchItemsResponse> {
    return this.gql<MondaySearchItemsResponse>({
      query: QUERY_SEARCH_ITEMS_BY_COLUMN,
      variables: {
        boardId: params.boardId,
        limit: params.limit ?? 10,
        columnId: params.columnId,
        columnValues: params.columnValues,
      },
    });
  }

  // Add a note/comment (update) to an item
  async createUpdate(params: {
    itemId: string;
    body: string;
  }): Promise<MondayCreateUpdateResponse> {
    return this.gql<MondayCreateUpdateResponse>({
      query: MUTATION_CREATE_UPDATE,
      variables: {
        itemId: params.itemId,
        body: params.body,
      },
    });
  }

  // Create a subitem under a parent item
  async createSubitem(params: {
    parentItemId: string;
    itemName: string;
  }): Promise<MondayCreateSubitemResponse> {
    return this.gql<MondayCreateSubitemResponse>({
      query: MUTATION_CREATE_SUBITEM,
      variables: {
        parentItemId: params.parentItemId,
        itemName: params.itemName,
      },
    });
  }
}
