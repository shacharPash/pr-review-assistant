// A new PR or comparison invalidates every completion from the previous one.
let sessionGeneration = 0;
let comparisonGeneration = 0;
const requestVersions = new Map<string, number>();
const requests = new Set<AbortController>();
const streams = new Set<EventSource>();

export function requestGuard(key: string, comparison = false): () => boolean {
  const session = sessionGeneration;
  const scope = comparisonGeneration;
  const version = (requestVersions.get(key) ?? 0) + 1;
  requestVersions.set(key, version);
  return () => session === sessionGeneration && (!comparison || scope === comparisonGeneration) &&
    requestVersions.get(key) === version;
}

export async function sessionFetch(input: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  requests.add(controller);
  const abort = () => controller.abort();
  init?.signal?.addEventListener('abort', abort, { once: true });
  if (init?.signal?.aborted) controller.abort();
  try {
    // Include body decoding in the cancellable lifetime.
    const response = await fetch(input, { ...init, signal: controller.signal });
    const data = await response.json();
    return { ok: response.ok, status: response.status, json: async () => data } as Response;
  } finally {
    init?.signal?.removeEventListener('abort', abort);
    requests.delete(controller);
  }
}

export function sessionStream(url: string): EventSource {
  const es = new EventSource(url);
  const generation = sessionGeneration;
  let active = true;
  const listen = es.addEventListener.bind(es);
  const close = es.close.bind(es);
  es.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject) => {
    listen(type, (event: Event) => {
      if (!active || generation !== sessionGeneration) return;
      if (typeof listener === 'function') listener.call(es, event);
      else listener.handleEvent(event);
    });
  }) as EventSource['addEventListener'];
  es.close = () => { active = false; streams.delete(es); close(); };
  streams.add(es);
  return es;
}

export function invalidateSession(): void {
  sessionGeneration++;
  comparisonGeneration++;
  requestVersions.clear();
  for (const controller of requests) controller.abort();
  for (const es of streams) es.close();
}

export function invalidateComparison(): void { comparisonGeneration++; }
