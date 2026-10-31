/**
 * After signing in, the button that opened the dialog is gone; focus goes to
 * whatever the page has marked as the place to continue from.
 */
export function focusAfterSignIn() {
  requestAnimationFrame(() => {
    const target =
      document.querySelector<HTMLElement>("[data-after-sign-in]") ??
      document.querySelector<HTMLElement>("[data-account-status]");
    target?.focus();
  });
}
