import { isError } from './error-utils';
import type { Response } from 'node-fetch';

/**
 * This error is thrown when there is an API error with a payload. The error
 * body includes the data that came in the payload plus status and a server
 * message. When it's a rate limit error in includes `retryAfter`
 */
export class APIError extends Error {
  status: number;
  serverMessage: string;
  link?: string;
  slug?: string;
  action?: string;
  retryAfter: number | null | 'never';
  [key: string]: any;

  constructor(message: string, response: Response, body?: Record<string, unknown>) {
    super();
    this.message = `${message} (${response.status})`;
    this.status = response.status;
    this.serverMessage = message;
    this.retryAfter = null;

    if (body) {
      for (const field of Object.keys(body)) {
        if (field !== 'message') {
          this[field] = body[field];
        }
      }
    }

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      if (retryAfter) {
        this.retryAfter = parseInt(retryAfter, 10);
      }
    }
  }
}

export function isAPIError(v: unknown): v is APIError {
  return isError(v) && 'status' in v;
}
