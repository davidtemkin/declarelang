import * as ContextMenu from '@radix-ui/react-context-menu';
import type { ReactNode } from 'react';
import { formatShortcut } from '../components/ui';
import * as cmd from './commands';
import { useEditor } from './store';

function Item({ children, shortcut, disabled, onSelect }: { children: ReactNode; shortcut?: string; disabled?: boolean; onSelect: () => void }) {
  return (
    <ContextMenu.Item className="menu-item" disabled={disabled} onSelect={onSelect}>
      <span className="menu-item-icon" />
      <span className="menu-item-label">{children}</span>
      {shortcut && <kbd className="menu-item-kbd">{formatShortcut(shortcut)}</kbd>}
    </ContextMenu.Item>
  );
}

/** Right-click on the slide: the actions that apply to what's under the pointer. */
export function CanvasContextMenu({ children }: { children: ReactNode }) {
  const count = useEditor((s) => s.selection.length);
  const none = count === 0;
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="menu" collisionPadding={8} loop>
          <Item shortcut="Mod+X" disabled={none} onSelect={cmd.cutSelection}>Cut</Item>
          <Item shortcut="Mod+C" disabled={none} onSelect={cmd.copySelection}>Copy</Item>
          <Item shortcut="Mod+V" disabled={!cmd.hasClipboard()} onSelect={cmd.paste}>Paste</Item>
          <Item shortcut="Mod+D" disabled={none} onSelect={cmd.duplicateSelection}>Duplicate</Item>
          <Item shortcut="Delete" disabled={none} onSelect={cmd.deleteSelection}>Delete</Item>
          <ContextMenu.Separator className="menu-separator" />
          <Item shortcut="Mod+G" disabled={!cmd.canGroup()} onSelect={cmd.group}>Group</Item>
          <Item shortcut="Mod+Shift+G" disabled={!cmd.canUngroup()} onSelect={cmd.ungroup}>Ungroup</Item>
          <ContextMenu.Separator className="menu-separator" />
          <Item shortcut="Mod+Shift+]" disabled={none} onSelect={() => cmd.changeOrder('front')}>Bring to Front</Item>
          <Item shortcut="Mod+]" disabled={none} onSelect={() => cmd.changeOrder('forward')}>Bring Forward</Item>
          <Item shortcut="Mod+[" disabled={none} onSelect={() => cmd.changeOrder('backward')}>Send Backward</Item>
          <Item shortcut="Mod+Shift+[" disabled={none} onSelect={() => cmd.changeOrder('back')}>Send to Back</Item>
          <ContextMenu.Separator className="menu-separator" />
          <Item shortcut="Mod+A" onSelect={cmd.selectAll}>Select All</Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
