import { useEffect, type ReactNode } from "react";

/**
 * Asks before something that can't be undone. Cancel is the green button under the thumb and has the focus; a tap
 * outside or Escape also cancels. Render it next to a scrolling screen, not inside it: inside, the overlay covers the
 * top of the page instead of the screen.
 */
export function Confirm({ title, action, onConfirm, onCancel, children }: { title: string; action: string; onConfirm: () => void; onCancel: () => void; children: ReactNode }) {
  useEffect(() => {
    const close = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onCancel]);
  return (
    <div className="overlay confirm" onClick={onCancel}>
      <div className="card" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-text" onClick={(e) => e.stopPropagation()}>
        <h2 id="confirm-title" className="lose">
          {title}
        </h2>
        <p id="confirm-text">{children}</p>
        <div className="actions">
          <button className="btn danger" onClick={onConfirm}>
            {action}
          </button>
          <button className="btn primary" autoFocus onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
