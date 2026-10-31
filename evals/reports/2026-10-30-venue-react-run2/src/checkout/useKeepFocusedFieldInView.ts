import { useEffect } from "react";

/**
 * When an on-screen keyboard opens it shrinks the visible part of the page;
 * bring the field being typed in back into the middle of what is left.
 */
export function useKeepFocusedFieldInView() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    let lastHeight = viewport.height;
    const onResize = () => {
      const shrank = viewport.height < lastHeight;
      lastHeight = viewport.height;
      const field = document.activeElement;
      if (shrank && (field instanceof HTMLInputElement || field instanceof HTMLSelectElement)) {
        field.scrollIntoView({ block: "center" });
      }
    };
    viewport.addEventListener("resize", onResize);
    return () => viewport.removeEventListener("resize", onResize);
  }, []);
}
