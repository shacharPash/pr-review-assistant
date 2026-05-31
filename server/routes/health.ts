import { Router, type Request, type Response } from 'express';
import { checkHealth } from '../services/healthCheck.js';

export const healthRouter = Router();

/**
 * Returns the status of the external CLIs the app depends on (gh + claude).
 * The UI hits this on first load to show a setup banner if anything is
 * missing. `?force=1` bypasses the 30s in-memory cache so the user can
 * re-poll after fixing a missing dep.
 */
healthRouter.get('/api/health', async (req: Request, res: Response) => {
  const force = req.query.force === '1';
  const report = await checkHealth(force);
  res.json(report);
});
