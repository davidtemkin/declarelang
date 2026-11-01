/**
 * Tells the person, in plain words, when the slide in front of them was changed or deleted
 * in another window, shows them that slide as it is now, and lets them choose. Nothing is
 * written over anyone's work until they do.
 */
import { SlideView } from '../components/SlideView';
import { WarningIcon } from '../components/icons';
import { Button } from '../components/ui';
import { useEditor } from './store';
import { activeSync } from './sync';

export function ConflictBanner() {
  const slideId = useEditor((s) => s.currentSlideId);
  const conflict = useEditor((s) => s.conflicts[s.currentSlideId]);
  const number = useEditor((s) => (s.doc?.order.indexOf(s.currentSlideId) ?? 0) + 1);
  const deckConflict = useEditor((s) => s.deckConflict);
  const others = useEditor((s) => Object.keys(s.conflicts).filter((id) => id !== s.currentSlideId).length);
  const sync = activeSync();

  if (deckConflict) {
    return (
      <div className="banner" role="alert">
        <WarningIcon size={18} className="banner-icon" />
        <div className="banner-text">
          <strong>Slides were added or removed in another window.</strong>
          <span>Your slides are safe here. Reload to see the presentation as it is now; unsaved changes on this page will be replaced.</span>
        </div>
        <div className="banner-actions">
          <Button variant="primary" onClick={() => void sync?.reload()}>Reload presentation</Button>
        </div>
      </div>
    );
  }

  if (!conflict) {
    if (!others) return null;
    return (
      <div className="banner banner-quiet" role="status">
        <WarningIcon size={18} className="banner-icon" />
        <div className="banner-text">
          <span>
            {others === 1 ? 'Another slide was' : `${others} other slides were`} changed in another window. Slides marked{' '}
            <WarningIcon size={13} className="inline-icon" /> are waiting for you to choose a version.
          </span>
        </div>
      </div>
    );
  }

  if (conflict.kind === 'deleted') {
    return (
      <div className="banner" role="alert">
        <WarningIcon size={18} className="banner-icon" />
        <div className="banner-text">
          <strong>Slide {number} was deleted in another window.</strong>
          <span>Keep it to put it back, or remove it here too.</span>
        </div>
        <div className="banner-actions">
          <Button onClick={() => sync?.removeDeleted(slideId)}>Remove it</Button>
          <Button variant="primary" onClick={() => sync?.keepMine(slideId)}>Keep it</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="banner" role="alert">
      <WarningIcon size={18} className="banner-icon" />
      <div className="banner-text">
        <strong>Someone changed slide {number} in another window since you opened it.</strong>
        <span>This is how it looks now. Use their version, or keep yours and replace theirs.</span>
      </div>
      <div className="banner-preview" aria-label="Their version">
        <SlideView background={conflict.theirs.background} elements={conflict.theirs.elements} label="Their version of the slide" />
      </div>
      <div className="banner-actions">
        <Button onClick={() => sync?.keepMine(slideId)}>Keep mine</Button>
        <Button variant="primary" onClick={() => sync?.useTheirs(slideId)}>Use their version</Button>
      </div>
    </div>
  );
}
