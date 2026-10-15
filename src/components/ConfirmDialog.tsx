import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { TriangleAlert } from "lucide-react";

export type ConfirmOptions = {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" styles the confirm button red, for actions that delete or overwrite. */
  tone?: "default" | "danger";
};

type Pending = ConfirmOptions & { resolve: (confirmed: boolean) => void };

const ConfirmContext = createContext<(options: ConfirmOptions) => Promise<boolean>>(async () => false);

/** Asks the user to confirm an action in an in-app dialog; resolves to their answer. */
export function useConfirm() {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setPending({ ...options, resolve });
      }),
    []
  );

  const close = useCallback(
    (confirmed: boolean) => {
      pending?.resolve(confirmed);
      setPending(null);
    },
    [pending]
  );

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && <ConfirmDialog options={pending} onClose={close} />}
    </ConfirmContext.Provider>
  );
}

function ConfirmDialog({ options, onClose }: { options: ConfirmOptions; onClose: (confirmed: boolean) => void }) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const danger = options.tone === "danger";

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    confirmRef.current?.focus();
    // Capture phase on window: runs before other Escape handlers (such as the
    // modal underneath), so Escape closes only this dialog.
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose(false);
      }
    };
    window.addEventListener("keydown", handleKey, true);
    return () => {
      window.removeEventListener("keydown", handleKey, true);
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="confirm-overlay" onClick={() => onClose(false)}>
      <div
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={options.message ? "confirm-message" : undefined}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="confirm-body">
          {danger && (
            <span className="confirm-icon">
              <TriangleAlert size={16} />
            </span>
          )}
          <div>
            <h2 id="confirm-title">{options.title}</h2>
            {options.message && <p id="confirm-message">{options.message}</p>}
          </div>
        </div>
        <div className="confirm-actions">
          <button type="button" className="secondary-button" onClick={() => onClose(false)}>
            {options.cancelLabel ?? "Cancel"}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={danger ? "danger-button" : "primary-button"}
            onClick={() => onClose(true)}
          >
            {options.confirmLabel ?? "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}
