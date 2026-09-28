// A modal surface: a bottom sheet on a phone, a side panel at a desk. Built on
// <dialog>, which brings focus trapping, Escape, and the top layer with it.

import { useEffect, useRef, type ReactNode } from "react";
import "./Sheet.css";

interface SheetProps {
  label: string;
  onClose(): void;
  children: ReactNode;
  tone?: "plain" | "hard";
}

export function Sheet({ label, onClose, children, tone = "plain" }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current!;
    if (!dialog.open) dialog.showModal();
    return () => dialog.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className={`sheet sheet--${tone}`}
      aria-label={label}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // A tap on the backdrop (the dialog element itself, outside its body) closes it.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet__body" tabIndex={-1} autoFocus>
        <button type="button" className="sheet__close" onClick={onClose} aria-label="Close">
          <span aria-hidden="true">×</span>
        </button>
        {children}
      </div>
    </dialog>
  );
}
