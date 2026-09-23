import { LayoutGrid, List as ListIcon, Search, X } from 'lucide-react';
import type { RefObject } from 'react';
import type { NoteView } from './NoteItem';

export type View = 'all' | 'pinned' | 'trash';

const TABS: Array<{ id: View; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'pinned', label: 'Pinned' },
  { id: 'trash', label: 'Trash' },
];

/**
 * One row holding the three views, the search field and the layout toggle.
 *
 * At panel widths everything has to earn its pixels: the tab labels are short,
 * the counts are small, and the search field is the only thing that flexes, so
 * it absorbs whatever space is left instead of forcing the row to wrap.
 */
export function FilterBar({
  view,
  counts,
  query,
  noteView,
  searchRef,
  onChangeView,
  onChangeQuery,
  onChangeNoteView,
}: {
  view: View;
  counts: Record<View, number>;
  query: string;
  noteView: NoteView;
  searchRef: RefObject<HTMLInputElement | null>;
  onChangeView: (view: View) => void;
  onChangeQuery: (query: string) => void;
  onChangeNoteView: (view: NoteView) => void;
}) {
  return (
    <div className="flex items-center gap-1 border-b border-line px-2 py-1.5">
      <nav aria-label="Notes views" className="flex shrink-0 items-center gap-px">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className="fn-chip"
            aria-pressed={view === tab.id}
            onClick={() => onChangeView(tab.id)}
          >
            {tab.label}
            {counts[tab.id] > 0 ? (
              <span aria-hidden="true" className="fn-count ml-1 text-muted">
                {counts[tab.id]}
              </span>
            ) : null}
            <span className="sr-only">, {counts[tab.id]} notes</span>
          </button>
        ))}
      </nav>

      <div className="flex min-w-[5.5rem] flex-1 items-center gap-1 rounded-md border border-line bg-bg px-1.5 py-1 focus-within:border-accent">
        <Search size={13} aria-hidden="true" className="shrink-0 text-muted" />
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(event) => onChangeQuery(event.target.value)}
          aria-label="Search notes, text, and sources"
          placeholder="Search"
          className="w-full min-w-0 border-0 bg-transparent text-xs outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <button
            type="button"
            className="fn-tool shrink-0"
            aria-label="Clear search"
            onClick={() => onChangeQuery('')}
          >
            <X size={13} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-px" role="group" aria-label="Note layout">
        <button
          type="button"
          className="fn-tool"
          aria-label="List view"
          title="List view"
          aria-pressed={noteView === 'list'}
          onClick={() => onChangeNoteView('list')}
        >
          <ListIcon size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="fn-tool"
          aria-label="Card view"
          title="Card view"
          aria-pressed={noteView === 'card'}
          onClick={() => onChangeNoteView('card')}
        >
          <LayoutGrid size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
