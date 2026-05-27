export class CpiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly body: string,
  ) {
    super(`CPI error ${statusCode}: ${body}`);
    this.name = 'CpiError';
  }
}
