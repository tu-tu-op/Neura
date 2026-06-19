export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class BlockchainError extends Error {
  constructor(message: string, public readonly details?: unknown) {
    super(message);
    this.name = "BlockchainError";
  }
}
