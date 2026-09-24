import { Copy, ExternalLink, FileText, Pin, RotateCcw, Tag, Trash2 } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { plural, t } from '../../lib/i18n';
import { TAG_MAX_LENGTH, type Note } from '../../lib/schema';
import { snippet } from '../../lib/search';
import { daysUntilPurge } from '../../lib/notes';
import { sanitizeHtml } from '../../lib/richtext';
import { formatTimestamp, formatUrl } from '../../lib/time';
import { Highlighted } from './Highlighted';

export type NoteView = 'list' | 'card';

export interface NoteActions {
  onEdit: (note: Note) => void;
  onCopy: (note: Note) => void;
  onCopyMarkdown: (note: Note) => void;
  onSetTag: (note: Note, tag: string | undefined) => void;
  onFilterTag: (tag: string) => void;
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
  return note.kind === 'thought' ? t('quickThought') : t('savedInApp');
}

export function NoteItem({
  note,
  terms,
  view,
  inTrash,
  retentionDays,
  tags,
  actions,
}: {
  note: Note;
  terms: string[];
  view: NoteView;
  inTrash: boolean;
  retentionDays: number;
  tags: string[];
  actions: NoteActions;
}) {
  const [tagging, setTagging] = useState(false);
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
      {note.tag ? (
        <>
          <button
            type="button"
            className="fn-tag"
            title={t('tagFilterTitle', note.tag)}
            aria-label={t('tagChipLabel', note.tag)}
            onClick={() => actions.onFilterTag(note.tag!)}
          >
            #<Highlighted text={note.tag} terms={terms} />
          </button>{' '}
        </>
      ) : null}
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
          <Action icon={RotateCcw} label={t('restore')} view={view} onClick={() => actions.onRestore(note)} />
          <Action icon={Trash2} label={t('deleteForever')} view={view} onClick={() => actions.onDeleteForever(note)} />
        </>
      ) : (
        <>
          {link ? (
            <Action icon={ExternalLink} label={t('openSource')} view={view} onClick={() => actions.onOpenSource(link)} />
          ) : null}
          <Action icon={Copy} label={t('copy')} view={view} onClick={() => actions.onCopy(note)} />
          <Action
            icon={FileText}
            label={t('copyMarkdown')}
            view={view}
            onClick={() => actions.onCopyMarkdown(note)}
          />
          <Action
            icon={Tag}
            label={note.tag ? t('changeTag') : t('addTag')}
            view={view}
            pressed={tagging}
            onClick={() => setTagging((open) => !open)}
          />
          <Action
            icon={Pin}
            label={note.pinned ? t('unpin') : t('pin')}
            view={view}
            pressed={note.pinned}
            onClick={() => actions.onTogglePin(note)}
          />
          <Action icon={Trash2} label={t('clear')} view={view} onClick={() => actions.onTrash(note)} />
        </>
      )}
    </div>
  );

  const tagEditor = tagging ? (
    <TagEditor
      initial={note.tag ?? ''}
      suggestions={tags}
      onDone={(next) => {
        setTagging(false);
        if (next !== undefined && next !== (note.tag ?? '')) {
          actions.onSetTag(note, next || undefined);
        }
      }}
    />
  ) : null;

  if (view === 'card') {
    return (
      <article className="mb-2 rounded-lg border border-line bg-bg p-3">
        {inTrash ? (
          body
        ) : (
          <button
            type="button"
            onClick={() => actions.onEdit(note)}
            aria-label={t('editNoteLabel', note.text.slice(0, 70))}
            className="block w-full border-0 bg-transparent p-0 text-left hover:text-accent"
          >
            {body}
          </button>
        )}
        <div className="mt-1.5">{meta}</div>
        {tagEditor}
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
            aria-label={t('editNoteLabel', note.text.slice(0, 70))}
            className="block w-full border-0 bg-transparent p-0 text-left hover:text-accent"
          >
            {body}
          </button>
        )}
        <div className="mt-0.5">{meta}</div>
        {tagEditor}
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

/**
 * The inline tag field. Enter or leaving the field saves; Escape backs out
 * without saving and without reaching the panel's own Escape handling, which
 * would otherwise cancel an edit or close the panel as well. An empty field
 * removes the tag.
 */
function TagEditor({
  initial,
  suggestions,
  onDone,
}: {
  initial: string;
  suggestions: string[];
  /** The new tag (empty to remove it), or undefined to leave it as it was. */
  onDone: (tag: string | undefined) => void;
}) {
  const [value, setValue] = useState(initial);
  const listId = useId();
  // Enter or Escape unmounts the field, which can blur it too; only the
  // first of those counts.
  const finished = useRef(false);
  const finish = (tag: string | undefined) => {
    if (finished.current) return;
    finished.current = true;
    onDone(tag);
  };

  return (
    <div className="mt-1.5 flex items-center gap-1">
      <span aria-hidden="true" className="text-xs text-muted">
        #
      </span>
      <input
        // Focus moves here because the user just asked for the field.
        autoFocus
        type="text"
        value={value}
        maxLength={TAG_MAX_LENGTH}
        list={listId}
        aria-label={t('tagInputLabel')}
        placeholder={t('tagPlaceholder')}
        className="w-full min-w-0 rounded-md border border-line bg-bg px-1.5 py-0.5 text-xs outline-none focus:border-accent"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            finish(value.trim());
          } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            finish(undefined);
          }
        }}
        onBlur={() => finish(value.trim())}
      />
      <datalist id={listId}>
        {suggestions.map((tag) => (
          <option key={tag} value={tag} />
        ))}
      </datalist>
    </div>
  );
}

function describeRecovery(note: Note, retentionDays: number): string {
  const days = daysUntilPurge(note, retentionDays);
  if (days <= 0) return t('recoverSoon');
  return plural(days, 'recoverOne', 'recoverOther');
}
