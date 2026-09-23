import { NotebookPen, Pin, Search, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';

export type EmptyKind = 'all' | 'pinned' | 'trash' | 'search';

const CONTENT: Record<EmptyKind, { icon: ReactNode; title: string; body: string }> = {
  all: {
    icon: <NotebookPen size={22} aria-hidden="true" />,
    title: 'A little space to think.',
    body: 'Jot a thought above, or select text on any page and choose “Save selection to For Now”.',
  },
  pinned: {
    icon: <Pin size={22} aria-hidden="true" />,
    title: 'Keep the useful bits close.',
    body: 'Pin a note to keep it at the top and out of bulk cleanup.',
  },
  trash: {
    icon: <Trash2 size={22} aria-hidden="true" />,
    title: 'Nothing in Trash',
    body: 'Cleared notes wait here before they are removed.',
  },
  search: {
    icon: <Search size={22} aria-hidden="true" />,
    title: 'No matching notes',
    body: 'Try a word from the note or its source.',
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
      <h3 className="mb-2.5 font-serif text-2xl font-normal tracking-tight">{title}</h3>
      <p className="mx-auto mb-5 max-w-60 text-[13px] text-muted">{body}</p>
      {action ? (
        <button type="button" className="fn-btn" onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
