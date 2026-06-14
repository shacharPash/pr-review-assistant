import type { BotBrand } from '@shared/reviewComments';
import sonarcloud from '../assets/bot-logos/sonarcloud.png';
import cursor from '../assets/bot-logos/cursor.png';
import jit from '../assets/bot-logos/jit.png';
import claude from '../assets/bot-logos/claude.png';
import copilot from '../assets/bot-logos/copilot.png';
import augment from '../assets/bot-logos/augment.png';

const LOGOS: Partial<Record<BotBrand, string>> = {
  sonarcloud, cursor, jit, claude, copilot, augment,
};

/** URL of a curated logo for the brand, or null to fall back to avatar/letter. */
export function brandLogo(brand: BotBrand | null): string | null {
  if (!brand) return null;
  return LOGOS[brand] ?? null;
}
