import type { BrowserAgentConfig, EndpointPolicy, HttpClient, StorageAdapter } from "./types";
import { EndpointClient, POLICY_CACHE_KEY } from "./endpoint-client";

export class PolicyClient {
  private readonly endpointClient: EndpointClient;

  constructor(config: BrowserAgentConfig, http: HttpClient, storage: StorageAdapter) {
    this.endpointClient = new EndpointClient(config, http, storage);
    this.storage = storage;
  }

  constructorStorageBrand?: never;
  private readonly storage: StorageAdapter;

  async getLatestPolicy(): Promise<EndpointPolicy | null> {
    const response = await this.endpointClient.checkInEndpoint();
    return response.policy;
  }

  async getCachedPolicy(): Promise<EndpointPolicy | null> {
    return this.storage.getItem<EndpointPolicy>(POLICY_CACHE_KEY);
  }
}
