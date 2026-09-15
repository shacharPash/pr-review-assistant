import { clearComparisons } from '../services/comparisons.js';
import { Router, type RequestHandler } from 'express';
import { clearCache } from '../services/cache.js';

const AI_PATHS = /^\/api\/(?:tldr|headline|diagram|before-after|complexity|explain|ai-comment|ai-chat|ai-review)(?:\/|$)/i;

/** Every AI request must carry the UI's explicit opt-in choice. */
export const requireAIConsent: RequestHandler = (req, res, next) => {
  if (AI_PATHS.test(req.path) && req.query.aiConsent !== '1') {
    res.status(403).json({ error: 'AI is off. Enable it in Local data & AI before sending repository content.' });
    return;
  }
  next();
};

export const privacyRouter = Router();
privacyRouter.post('/api/local-data/clear', (_req, res) => {
  clearCache();
  clearComparisons();
  res.json({ cleared: true });
});
