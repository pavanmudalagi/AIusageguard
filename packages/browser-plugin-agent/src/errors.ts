export class BrowserAgentError extends Error {}

export class ForbiddenRawContentError extends BrowserAgentError {
  constructor() {
    super("Event rejected because it contained forbidden raw content fields.");
  }
}

export class MetadataTooLargeError extends BrowserAgentError {
  constructor() {
    super("Event metadata exceeds the 16KB limit.");
  }
}

export class HttpRequestError extends BrowserAgentError {
  constructor(public status: number, message: string) {
    super(message);
  }
}
