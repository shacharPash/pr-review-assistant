import { create } from 'zustand';

const AI_KEY = 'pra.aiEnabled';

function initialAIEnabled(): boolean {
  try { return typeof window !== 'undefined' && window.localStorage.getItem(AI_KEY) === '1'; }
  catch { return false; }
}

export const usePrivacy = create<{ aiEnabled: boolean; setAIEnabled: (enabled: boolean) => void }>((set) => ({
  aiEnabled: initialAIEnabled(),
  setAIEnabled(enabled) {
    set({ aiEnabled: enabled });
    try { window.localStorage.setItem(AI_KEY, enabled ? '1' : '0'); } catch { /* Current session still works. */ }
  },
}));

export function isAIEnabled(): boolean { return usePrivacy.getState().aiEnabled; }

export function applicationData(storage: Storage): Record<string, string> {
  const data: Record<string, string> = {};
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key?.startsWith('pra.')) data[key] = storage.getItem(key) ?? '';
  }
  return data;
}

export function clearApplicationData(storage: Storage): void {
  for (const key of Object.keys(applicationData(storage))) storage.removeItem(key);
}
