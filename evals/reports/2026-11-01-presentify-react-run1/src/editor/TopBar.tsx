import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CloudCheckIcon, CloudOffIcon, EllipseIcon, LineIcon, Mark, PlayIcon, RectIcon, RedoIcon, SelectIcon, TextIcon, UndoIcon,
} from '../components/icons';
import { Button, IconButton, Menu, MenuBarButton, MenuContent, MenuItem, MenuSeparator, Tooltip, formatShortcut } from '../components/ui';
import * as cmd from './commands';
import { editor, selectCanRedo, selectCanUndo, type Tool, useEditor } from './store';
import { activeSync } from './sync';

const TOOLS: { tool: Tool; label: string; key: string; Icon: typeof SelectIcon }[] = [
  { tool: 'select', label: 'Select', key: 'V', Icon: SelectIcon },
  { tool: 'rect', label: 'Rectangle', key: 'R', Icon: RectIcon },
  { tool: 'ellipse', label: 'Ellipse', key: 'O', Icon: EllipseIcon },
  { tool: 'line', label: 'Line', key: 'L', Icon: LineIcon },
  { tool: 'text', label: 'Text', key: 'T', Icon: TextIcon },
];

export function TopBar({ autoFocusTitle }: { autoFocusTitle: boolean }) {
  const tool = useEditor((s) => s.tool);
  const canUndo = useEditor(selectCanUndo);
  const canRedo = useEditor(selectCanRedo);

  return (
    <header className="topbar">
      <div className="topbar-start">
        <Tooltip label="All presentations">
          <Link to="/" className="home-link" aria-label="All presentations">
            <Mark size={26} />
          </Link>
        </Tooltip>
        <TitleField autoFocus={autoFocusTitle} />
        <nav className="menubar" aria-label="Menu">
          <EditMenu />
          <ArrangeMenu />
          <SlideMenu />
        </nav>
      </div>

      <div className="toolbar" role="toolbar" aria-label="Tools">
        {TOOLS.map(({ tool: t, label, key, Icon }) => (
          <IconButton key={t} label={label} shortcut={key} pressed={tool === t} onClick={() => editor.setTool(t)} className="tool-button">
            <Icon />
          </IconButton>
        ))}
      </div>

      <div className="topbar-end">
        <SaveStatus />
        <div className="history-buttons">
          <IconButton label="Undo" shortcut="Mod+Z" disabled={!canUndo} onClick={editor.undo}>
            <UndoIcon />
          </IconButton>
          <IconButton label="Redo" shortcut="Mod+Shift+Z" disabled={!canRedo} onClick={editor.redo}>
            <RedoIcon />
          </IconButton>
        </div>
        <Tooltip label="Present from this slide" shortcut="Mod+Enter">
          <Button variant="primary" className="present-button" onClick={() => cmd.present()}>
            <PlayIcon size={16} /> Present
          </Button>
        </Tooltip>
      </div>
    </header>
  );
}

function TitleField({ autoFocus }: { autoFocus: boolean }) {
  const title = useEditor((s) => s.doc?.title ?? '');
  const [draft, setDraft] = useState(title);
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!focused) setDraft(title);
  }, [title, focused]);

  useEffect(() => {
    if (autoFocus) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [autoFocus]);

  return (
    <Tooltip label="Rename presentation">
      <input
        ref={ref}
        className="title-field"
        aria-label="Presentation title"
        value={draft}
        maxLength={200}
        spellCheck={false}
        onFocus={(e) => {
          setFocused(true);
          e.currentTarget.select();
        }}
        onBlur={() => {
          setFocused(false);
          cmd.renameDeck(draft);
        }}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setDraft(title);
            setTimeout(() => ref.current?.blur());
          }
        }}
        // Size the field to its text, within limits, so short titles don't leave a gap.
        style={{ width: `calc(${Math.min(Math.max(draft.length, 8), 36)}ch + 20px)` }}
      />
    </Tooltip>
  );
}

/** Exactly one of three states, always shown. */
export function SaveStatus() {
  const state = useEditor((s) => s.saveState);
  const text = state === 'saved' ? 'All changes saved' : state === 'saving' ? 'Saving…' : "Not saved: can't reach the service";
  return (
    <Tooltip label={state === 'offline' ? 'Your changes are kept here and will be saved as soon as the service answers.' : `Saves automatically · ${formatShortcut('Mod+S')} saves now`}>
      <button
        type="button"
        className={`save-status is-${state}`}
        onClick={() => activeSync()?.saveNow()}
        aria-live="polite"
      >
        {state === 'offline' ? <CloudOffIcon size={16} /> : state === 'saving' ? <span className="spinner" aria-hidden /> : <CloudCheckIcon size={16} />}
        <span>{text}</span>
      </button>
    </Tooltip>
  );
}

function EditMenu() {
  const canUndo = useEditor(selectCanUndo);
  const canRedo = useEditor(selectCanRedo);
  const has = useEditor((s) => s.selection.length > 0);
  return (
    <Menu>
      <MenuBarButton>Edit</MenuBarButton>
      <MenuContent>
        <MenuItem shortcut="Mod+Z" disabled={!canUndo} onSelect={editor.undo}>Undo</MenuItem>
        <MenuItem shortcut="Mod+Shift+Z" disabled={!canRedo} onSelect={editor.redo}>Redo</MenuItem>
        <MenuSeparator />
        <MenuItem shortcut="Mod+X" disabled={!has} onSelect={cmd.cutSelection}>Cut</MenuItem>
        <MenuItem shortcut="Mod+C" disabled={!has} onSelect={cmd.copySelection}>Copy</MenuItem>
        <MenuItem shortcut="Mod+V" disabled={!cmd.hasClipboard()} onSelect={cmd.paste}>Paste</MenuItem>
        <MenuItem shortcut="Mod+D" disabled={!has} onSelect={cmd.duplicateSelection}>Duplicate</MenuItem>
        <MenuItem shortcut="Delete" disabled={!has} onSelect={cmd.deleteSelection}>Delete</MenuItem>
        <MenuSeparator />
        <MenuItem shortcut="Mod+A" onSelect={cmd.selectAll}>Select All</MenuItem>
        <MenuItem shortcut="Escape" disabled={!has} onSelect={cmd.clearSelection}>Select None</MenuItem>
        <MenuSeparator />
        <MenuItem shortcut="Mod+S" onSelect={() => activeSync()?.saveNow()}>Save Now</MenuItem>
      </MenuContent>
    </Menu>
  );
}

function ArrangeMenu() {
  const count = useEditor((s) => s.selection.length);
  useEditor((s) => s.doc); // re-render so group/ungroup availability stays current
  return (
    <Menu>
      <MenuBarButton>Arrange</MenuBarButton>
      <MenuContent>
        <MenuItem shortcut="Mod+G" disabled={!cmd.canGroup()} onSelect={cmd.group}>Group</MenuItem>
        <MenuItem shortcut="Mod+Shift+G" disabled={!cmd.canUngroup()} onSelect={cmd.ungroup}>Ungroup</MenuItem>
        <MenuSeparator />
        <MenuItem shortcut="Mod+Shift+]" disabled={!count} onSelect={() => cmd.changeOrder('front')}>Bring to Front</MenuItem>
        <MenuItem shortcut="Mod+]" disabled={!count} onSelect={() => cmd.changeOrder('forward')}>Bring Forward</MenuItem>
        <MenuItem shortcut="Mod+[" disabled={!count} onSelect={() => cmd.changeOrder('backward')}>Send Backward</MenuItem>
        <MenuItem shortcut="Mod+Shift+[" disabled={!count} onSelect={() => cmd.changeOrder('back')}>Send to Back</MenuItem>
        <MenuSeparator />
        <MenuItem disabled={!count} onSelect={() => cmd.align('left')}>Align Left Edges</MenuItem>
        <MenuItem disabled={!count} onSelect={() => cmd.align('center')}>Align Centres</MenuItem>
        <MenuItem disabled={!count} onSelect={() => cmd.align('right')}>Align Right Edges</MenuItem>
        <MenuItem disabled={!count} onSelect={() => cmd.align('top')}>Align Tops</MenuItem>
        <MenuItem disabled={!count} onSelect={() => cmd.align('middle')}>Align Middles</MenuItem>
        <MenuItem disabled={!count} onSelect={() => cmd.align('bottom')}>Align Bottoms</MenuItem>
        <MenuSeparator />
        <MenuItem disabled={count < 3} onSelect={() => cmd.distribute('horizontal')}>Distribute Horizontally</MenuItem>
        <MenuItem disabled={count < 3} onSelect={() => cmd.distribute('vertical')}>Distribute Vertically</MenuItem>
      </MenuContent>
    </Menu>
  );
}

function SlideMenu() {
  const count = useEditor((s) => s.doc?.order.length ?? 0);
  return (
    <Menu>
      <MenuBarButton>Slide</MenuBarButton>
      <MenuContent>
        <MenuItem onSelect={cmd.addSlide}>New Slide</MenuItem>
        <MenuItem onSelect={() => cmd.duplicateSlide()}>Duplicate Slide</MenuItem>
        <MenuItem danger disabled={count <= 1} onSelect={() => cmd.deleteSlide()}>Delete Slide</MenuItem>
        <MenuSeparator />
        <MenuItem shortcut="Mod+Enter" onSelect={() => cmd.present()}>Present from This Slide</MenuItem>
        <MenuItem onSelect={() => cmd.present({ fromStart: true })}>Present from Start</MenuItem>
      </MenuContent>
    </Menu>
  );
}
