import { NotebookPen, Pin, Search, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { t, type MessageKey } from '../../lib/i18n';

export type EmptyKind = 'all' | 'pinned' | 'trash' | 'search';

const CONTENT: Record<EmptyKind, { icon: ReactNode; title: MessageKey; body: MessageKey }> = {
  all: {
    icon: <NotebookPen size={22} aria-hidden="true" />,
    title: 'emptyAllTitle',
    body: 'emptyAllBody',
  },
  pinned: {
    icon: <Pin size={22} aria-hidden="true" />,
    title: 'emptyPinnedTitle',
    body: 'emptyPinnedBody',
  },
  trash: {
    icon: <Trash2 size={22} aria-hidden="true" />,
    title: 'emptyTrashTitle',
    body: 'emptyTrashBody',
  },
  search: {
    icon: <Search size={22} aria-hidden="true" />,
    title: 'emptySearchTitle',
    body: 'emptySearchBody',
  },
};

export function EmptyState({
  kind,
  action,
}: {
  kind: EmptyKind;
  action?: { label: string; onClick: () => void };
}) {
  const { icon, title, body } = CONTENT[kind];
  return (
    <div className="px-3 pt-10 pb-12 text-center">
      <span className="mb-4 inline-flex rounded-full border border-line p-3.5 text-accent">
        {icon}
      </span>
      <h3 className="mb-2.5 font-serif text-2xl font-normal tracking-tight">{t(title)}</h3>
      <p className="mx-auto mb-5 max-w-60 text-[13px] text-muted">{t(body)}</p>
      {action ? (
        <button type="button" className="fn-btn" onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
