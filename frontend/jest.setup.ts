import "@testing-library/jest-dom";

// Standard Web API polyfills for jsdom environment
class MockHeaders {
  private map = new Map<string, string>();

  constructor(init?: HeadersInit) {
    if (init) {
      if (Array.isArray(init)) {
        init.forEach(([k, v]) => this.map.set(k.toLowerCase(), v));
      } else if (typeof init === "object") {
        Object.entries(init).forEach(([k, v]) => this.map.set(k.toLowerCase(), String(v)));
      }
    }
  }

  get(name: string): string | null {
    return this.map.get(name.toLowerCase()) ?? null;
  }

  set(name: string, value: string): void {
    this.map.set(name.toLowerCase(), value);
  }

  has(name: string): boolean {
    return this.map.has(name.toLowerCase());
  }

  forEach(callback: (value: string, key: string) => void): void {
    this.map.forEach(callback);
  }
}

class MockResponse {
  status: number;
  statusText: string;
  ok: boolean;
  headers: Headers;
  private _body: unknown;

  constructor(body?: unknown, init?: ResponseInit) {
    this.status = init?.status ?? 200;
    this.statusText = init?.statusText ?? (this.status >= 200 && this.status < 300 ? "OK" : "Error");
    this.ok = this.status >= 200 && this.status < 300;
    this.headers = new MockHeaders(init?.headers) as unknown as Headers;
    this._body = body;
  }

  async json(): Promise<unknown> {
    if (typeof this._body === "string") {
      return JSON.parse(this._body);
    }
    return this._body;
  }

  async text(): Promise<string> {
    if (typeof this._body === "string") {
      return this._body;
    }
    return JSON.stringify(this._body);
  }
}

global.Headers = MockHeaders as unknown as typeof Headers;
global.Response = MockResponse as unknown as typeof Response;

if (typeof global.fetch === "undefined") {
  global.fetch = jest.fn().mockImplementation(() =>
    Promise.resolve(new MockResponse(JSON.stringify({ mode: "simulated" })))
  );
}

// Polyfill IntersectionObserver for jsdom
class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin: string = "";
  readonly thresholds: ReadonlyArray<number> = [];
  callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }

  observe = jest.fn((target: Element) => {
    this.callback(
      [
        {
          boundingClientRect: target.getBoundingClientRect(),
          intersectionRatio: 1,
          intersectionRect: target.getBoundingClientRect(),
          isIntersecting: true,
          rootBounds: null,
          target,
          time: Date.now(),
        } as IntersectionObserverEntry,
      ],
      this,
    );
  });
  unobserve = jest.fn();
  disconnect = jest.fn();
  takeRecords = jest.fn(() => []);
}
global.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;

// Polyfill ResizeObserver for jsdom
class MockResizeObserver {
  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
