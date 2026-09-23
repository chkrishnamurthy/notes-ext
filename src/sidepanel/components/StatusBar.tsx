import type { ReactNode } from 'react';

export interface StatusAction {
  label: string;
  onClick: () => void;
}

/**
 * The panel's single announcement region. Every outcome — saved, moved to
 * Trash, restored, copied — is announced here, so a screen reader user hears
 * the same confirmation a sighted user sees.
 */
export function StatusBar({
  message,
  action,
  tone = 'neutral',
}: {
  message: string;
  action?: StatusAction;
  tone?: 'neutral' | 'warning';
}) {
  const body: ReactNode = message ? (
    <div
      className={
        tone === 'warning'
          ? 'mx-4 mb-3 flex items-center justify-between gap-2 rounded-[7px] bg-warning-bg px-2.5 py-2 text-xs text-warning'
          : 'mx-4 mb-3 flex items-center justify-between gap-2 rounded-[7px] bg-soft px-2.5 py-2 text-xs'
      }
    >
      <span>{message}</span>
      {action ? (
        <button type="button" className="fn-btn fn-btn-quiet fn-btn-small" onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
    </div>
  ) : null;

  // The live region stays mounted even when empty; a region added to the DOM
  // at the same moment as its text is not reliably announced.
  return (
    <div role="status" aria-live="polite" aria-atomic="true">
      {body}
    </div>
  );
}
