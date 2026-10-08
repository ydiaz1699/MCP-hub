import type { BridgeRequest } from './types.js';

export class BridgeClient {
  constructor(private readonly baseUrl: string) {}

  async call(request: BridgeRequest, token: string): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}/rpc`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(request)
    });
    if (!response.ok) throw new Error(`VS Code Bridge ${response.status}: ${await response.text()}`);
    return response.json();
  }
}
