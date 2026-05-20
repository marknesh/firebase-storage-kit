export interface FileMetadata {
  path: string;
  size: number;
  contentType?: string;
  createdAt: Date;
  updatedAt: Date;
  customMetadata?: Record<string, string>;
}
