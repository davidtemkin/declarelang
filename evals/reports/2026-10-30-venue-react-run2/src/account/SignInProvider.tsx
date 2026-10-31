import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { SignInDialog } from "./SignInDialog";

type SignInContextValue = { openSignIn: () => void };

const SignInContext = createContext<SignInContextValue | null>(null);

/**
 * Signing in happens in a dialog over whatever the person is doing, so that
 * nothing they have chosen or typed is disturbed by it.
 */
export function SignInProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openSignIn = useCallback(() => setOpen(true), []);
  const value = useMemo(() => ({ openSignIn }), [openSignIn]);

  return (
    <SignInContext.Provider value={value}>
      {/* While the dialog is open the page behind it is out of reach, for assistive technology too. */}
      <div className="app" aria-hidden={open || undefined}>
        {children}
      </div>
      <SignInDialog open={open} onClose={() => setOpen(false)} />
    </SignInContext.Provider>
  );
}

export function useSignInDialog() {
  const value = useContext(SignInContext);
  if (!value) throw new Error("useSignInDialog must be used inside <SignInProvider>");
  return value;
}
