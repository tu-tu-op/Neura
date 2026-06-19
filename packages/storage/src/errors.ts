export class StorageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageValidationError";
  }
}

export class StorageConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageConflictError";
  }
}

export class StorageNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageNotFoundError";
  }
}
