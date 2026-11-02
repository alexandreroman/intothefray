// Test helper: just enough of a WebSocket to run a real GameSession against a fake server.

/** The network under a session: what it sends, and ways to open, answer or drop the connection. */
export class FakeWebSocket {
  /** Every socket created, oldest first; a test may reset it. */
  static instances: FakeWebSocket[] = [];

  /** The socket created last. */
  static get last(): FakeWebSocket {
    const socket = FakeWebSocket.instances.at(-1);
    if (socket === undefined) {
      throw new Error('no WebSocket was created');
    }
    return socket;
  }

  readyState = 0;
  sent: Record<string, unknown>[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }

  close(): void {
    this.readyState = 3;
  }

  /** The server accepts the connection. */
  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  /** The server sends a message. */
  receive(message: object): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  /** The connection is lost (1006: closed abnormally). */
  drop(code = 1006): void {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}
