import { Copy, ExternalLink, Pin, RotateCcw, Trash2 } from 'lucide-react';
import type { Note } from '../../lib/schema';
import { snippet } from '../../lib/search';
import { daysUntilPurge } from '../../lib/notes';
import { sanitizeHtml } from '../../lib/richtext';
import { formatTimestamp, formatUrl } from '../../lib/time';
import { Highlighted } from './Highlighted';

export type NoteView = 'list' | 'card';

export interface NoteActions {
  onEdit: (note: Note) => void;
  onCopy: (note: Note) => void;
  onTogglePin: (note: Note) => void;
  onTrash: (note: Note) => void;
  onRestore: (note: Note) => void;
  onDeleteForever: (note: Note) => void;
  onOpenSource: (url: string) => void;
}

const sourceLink = (note: Note): string | undefined => note.targetUrl ?? note.sourceUrl;

/** The context line under a note: where it came from, then when. */
function describeSource(note: Note): string {
  if (note.sourceTitle) return note.sourceTitle;
  const url = note.sourceUrl ?? note.targetUrl;
  if (url) return formatUrl(url);
  return note.kind === 'thought' ? 'Quick thought' : 'Saved in For Now';
}

export function NoteItem({
  note,
  terms,
  view,
  inTrash,
  retentionDays,
  actions,
}: {
  note: Note;
  terms: string[];
  view: NoteView;
  inTrash: boolean;
  retentionDays: number;
  actions: NoteActions;
}) {
  const searching = terms.length > 0;
  const source = describeSource(note);
  const link = sourceLink(note);

  // While searching, both views fall back to a highlighted plain-text snippet:
  // it shows *why* the note matched, which rendered formatting cannot.
  const preview = snippet(note.text, terms);
  const snippetText = `${preview.truncatedStart ? '…' : ''}${preview.text}${
    preview.truncatedEnd ? '…' : ''
  }`;

  const body =
    searching || view === 'list' ? (
      <span
        className={
          view === 'list'
            ? 'line-clamp-2 text-sm leading-snug font-medium whitespace-pre-line'
            : 'block text-sm leading-normal font-medium whitespace-pre-wrap [overflow-wrap:anywhere]'
        }
      >
        <Highlighted text={searching ? snippetText : note.text} terms={terms} />
      </span>
    ) : (
      <div
        className="fn-prose fn-prose-note"
        // Sanitized again at the point of rendering, not only when stored, so
        // a record written by an older build or edited outside the extension
        // still cannot inject anything.
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(note.html) }}
      />
    );

  const meta = (
    <div className="text-[11px] text-muted [overflow-wrap:anywhere]">
      <Highlighted text={source} terms={terms} />
      <span> · {formatTimestamp(note.updatedAt)}</span>
      {inTrash ? <span> · {describeRecovery(note, retentionDays)}</span> : null}
    </div>
  );

  const buttons = (
    <div
      className={
        view === 'list'
          ? // Hidden until the row is hovered or something inside it has focus,
            // so a dense list stays scannable without losing keyboard access.
            'flex shrink-0 items-center gap-px opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100'
          : 'mt-2 flex flex-wrap justify-end gap-0.5'
      }
    >
      {inTrash ? (
        <>
          <Action icon={RotateCcw} label="Restore" view={view} onClick={() => actions.onRestore(note)} />
          <Action icon={Trash2} label="Delete forever" view={view} onClick={() => actions.onDeleteForever(note)} />
        </>
      ) : (
        <>
          {link ? (
            <Action icon={ExternalLink} label="Open source" view={view} onClick={() => actions.onOpenSource(link)} />
          ) : null}
          <Action icon={Copy} label="Copy" view={view} onClick={() => actions.onCopy(note)} />
          <Action
            icon={Pin}
            label={note.pinned ? 'Unpin' : 'Pin'}
            view={view}
            pressed={note.pinned}
            onClick={() => actions.onTogglePin(note)}
          />
          <Action icon={Trash2} label="Clear" view={view} onClick={() => actions.onTrash(note)} />
        </>
      )}
    </div>
  );

  if (view === 'card') {
    return (
      <article className="mb-2 rounded-lg border border-line bg-bg p-3">
        {inTrash ? (
          body
        ) : (
          <button
            type="button"
            onClick={() => actions.onEdit(note)}
            aria-label={`Edit note: ${note.text.slice(0, 70)}`}
            className="block w-full border-0 bg-transparent p-0 text-left hover:text-accent"
          >
            {body}
          </button>
        )}
        <div className="mt-1.5">{meta}</div>
        {buttons}
      </article>
    );
  }

  return (
    <article className="group flex items-start gap-2 border-b border-line py-2 last:border-b-0">
      <div className="min-w-0 flex-1">
        {inTrash ? (
          body
        ) : (
          <button
            type="button"
            onClick={() => actions.onEdit(note)}
            aria-label={`Edit note: ${note.text.slice(0, 70)}`}
            className="block w-full border-0 bg-transparent p-0 text-left hover:text-accent"
          >
            {body}
          </button>
        )}
        <div className="mt-0.5">{meta}</div>
      </div>
      {buttons}
    </article>
  );
}

function Action({
  icon: Icon,
  label,
  view,
  pressed,
  onClick,
}: {
  icon: typeof Copy;
  label: string;
  view: NoteView;
  pressed?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={view === 'list' ? 'fn-tool' : 'fn-btn fn-btn-quiet fn-btn-small'}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
    >
      <Icon size={view === 'list' ? 14 : 13} aria-hidden="true" />
      {view === 'card' ? <span>{label}</span> : null}
    </button>
  );
}

function describeRecovery(note: Note, retentionDays: number): string {
  const days = daysUntilPurge(note, retentionDays);
  if (days <= 0) return 'removed soon';
  if (days === 1) return '1 day left to recover';
  return `${days} days left to recover`;
}
