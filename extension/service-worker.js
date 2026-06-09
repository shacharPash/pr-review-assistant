import { parsePrUrl, canonicalPrUrl, buildTargetUrl } from './src/prUrl.js';

const BASE = 'http://localhost:5173';
const HEALTH_TIMEOUT_MS = 1500;

chrome.action.onClicked.addListener(async (tab) => {
  const parsed = parsePrUrl(tab?.url);
  if (!parsed) {
    notify('Open a GitHub PR first', 'Go to a github.com pull request, then click the icon.');
    return;
  }
  const prUrl = canonicalPrUrl(parsed);
  if (await serverIsUp()) {
    chrome.tabs.create({ url: buildTargetUrl(prUrl, BASE) });
  } else {
    chrome.tabs.create({ url: chrome.runtime.getURL('help.html') });
  }
});

async function serverIsUp() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}/api/health`, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function notify(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon-48.png',
    title,
    message,
  });
}
