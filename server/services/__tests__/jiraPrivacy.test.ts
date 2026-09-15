import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchTicket, fetchTickets } from '../jira.js';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

function configure() {
  vi.stubEnv('JIRA_BASE_URL', 'https://jira.example.test');
  vi.stubEnv('JIRA_EMAIL', 'fixture@example.test');
  vi.stubEnv('JIRA_API_TOKEN', 'fixture');
}

describe('optional Jira data', () => {
  it('only requests useful fields and never follows credential redirects', async () => {
    configure();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ key: 'APP-1', fields: { summary: 'Fixture', assignee: { displayName: 'Unused person' } } }) });
    vi.stubGlobal('fetch', fetchMock);
    const ticket = await fetchTicket('APP-1');
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).not.toMatch(/assignee|reporter/);
    expect(ticket).not.toHaveProperty('assignee');
    expect(options.redirect).toBe('error');
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('bounds requests even for a description with hundreds of ticket keys', async () => {
    configure();
    const fetchMock = vi.fn().mockRejectedValue(new Error('fixture unavailable'));
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchTickets(Array.from({ length: 50 }, (_, i) => `APP-${i}`));
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(result.failures).toHaveLength(50);
  });
});
