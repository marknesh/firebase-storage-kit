export const CONFLICT_ERROR_CODES = {
  pathAlreadyExists: "conflict/path-already-exists",
} as const;

export type ConflictErrorCode =
  (typeof CONFLICT_ERROR_CODES)[keyof typeof CONFLICT_ERROR_CODES];

export class ConflictError extends Error {
  override readonly name = "ConflictError";
  readonly code: ConflictErrorCode;
  readonly path: string;

  constructor(message: string, code: ConflictErrorCode, path: string) {
    super(message);
    this.code = code;
    this.path = path;
  }
}
