import { Keyboard, MousePointerClick, PenLine } from 'lucide-react';
import type { ReactNode } from 'react';
import { t, type MessageKey } from '../../lib/i18n';

// Built per render: the menu item's name is looked up in the user's language.
const tips = (): Array<{ icon: ReactNode; text: MessageKey; args?: string[] }> => [
  { icon: <PenLine size={16} aria-hidden="true" />, text: 'welcomeTip1' },
  { icon: <MousePointerClick size={16} aria-hidden="true" />, text: 'welcomeTip2', args: [t('menuSaveSelection')] },
  { icon: <Keyboard size={16} aria-hidden="true" />, text: 'welcomeTip3' },
];

/**
 * Shown once, under the empty state of a panel that has never held a note: the
 * three ways in, and where cleared notes go. It explains and then gets out of
 * the way — dismissing it is remembered, and it never comes back.
 */
export function Welcome({
  retentionDays,
  onDismiss,
}: {
  retentionDays: number;
  onDismiss: () => void;
}) {
  return (
    <section
      aria-labelledby="welcome-title"
      className="mx-4 mb-6 rounded-[10px] border border-line bg-soft px-4 py-3 text-left"
    >
      <h3 id="welcome-title" className="mb-2 text-[13px] font-semibold">
        {t('welcomeTitle')}
      </h3>
      <ul className="space-y-2 text-[13px] text-muted">
        {tips().map(({ icon, text, args = [] }) => (
          <li key={text} className="flex gap-2">
            <span className="mt-0.5 shrink-0 text-accent">{icon}</span>
            <span>{t(text, ...args)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">{t('welcomeFooter', retentionDays)}</p>
      <button type="button" className="fn-btn fn-btn-small mt-3" onClick={onDismiss}>
        {t('welcomeDismiss')}
      </button>
    </section>
  );
}
