import { parsePrUrl, canonicalPrUrl, buildTargetUrl } from './src/prUrl.js';

const BASE = 'http://localhost:5173';
const HEALTH_TIMEOUT_MS = 1500;

chrome.action.onClicked.addListener(async (tab) => {
  if (!(await serverIsUp())) {
    chrome.tabs.create({ url: chrome.runtime.getURL('help.html') });
    return;
  }
  // On a PR page, deep-link to it; anywhere else, just open the app's landing
  // page so the icon is always useful (paste a PR URL there).
  const parsed = parsePrUrl(tab?.url);
  const url = parsed ? buildTargetUrl(canonicalPrUrl(parsed), BASE) : BASE;
  chrome.tabs.create({ url });
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
