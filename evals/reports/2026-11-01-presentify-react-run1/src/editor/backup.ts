/**
 * A copy of work not yet on the service, kept in this browser. If the window closes while
 * the service can't be reached, the next time the presentation opens the work is put back
 * and saved, so nothing is lost by a failed save.
 */
import type { SlideElement } from '../model/types';

export interface SlideBackup {
  /** The service's version of the slide when this work was based on it. */
  baseVersion: number;
  background: string;
  elements: SlideElement[];
}

export interface NewSlideBackup {
  /** The service slide it follows, or null for first. */
  after: string | null;
  background: string;
  elements: SlideElement[];
}

export interface Backup {
  title?: string;
  /** Changed slides, by service slide id. */
  slides: Record<string, SlideBackup>;
  newSlides: NewSlideBackup[];
}

const key = (deckId: string) => `presentify.unsaved.${deckId}`;

export function readBackup(deckId: string): Backup | null {
  try {
    const raw = localStorage.getItem(key(deckId));
    return raw ? (JSON.parse(raw) as Backup) : null;
  } catch {
    return null;
  }
}

export function writeBackup(deckId: string, backup: Backup | null) {
  try {
    if (backup) localStorage.setItem(key(deckId), JSON.stringify(backup));
    else localStorage.removeItem(key(deckId));
  } catch {
    // Storage full or unavailable: the in-memory copy and retries still stand.
  }
}
