export interface StorageListItem {
  path: string;
  name: string;
}

export interface StorageListResult {
  prefixes: string[];
  items: StorageListItem[];
  nextPageToken?: string;
}

export interface ListOptions {
  maxResults?: number;
  pageToken?: string;
}
