import type { Note } from '../../lib/schema';
import { plural, t } from '../../lib/i18n';
import { groupFor, groupLabel } from '../../lib/time';
import { NoteItem, type NoteActions, type NoteView } from './NoteItem';

export function NoteList({
  notes,
  terms,
  view,
  inTrash,
  retentionDays,
  tags,
  actions,
}: {
  notes: Note[];
  terms: string[];
  view: NoteView;
  inTrash: boolean;
  retentionDays: number;
  /** Tags already in use, offered as suggestions when tagging a note. */
  tags: string[];
  actions: NoteActions;
}) {
  const searching = terms.length > 0;

  // While searching, one flat result group reads better than date headings:
  // the question is "how many matched", not "when did I write them".
  const heading = searching ? plural(notes.length, 'matchingOne', 'matchingOther') : null;

  let lastGroup: string | null = null;

  return (
    <div className="px-4 pt-1 pb-4">
      {heading ? <GroupHeading label={heading} /> : null}
      {notes.map((note) => {
        const group = searching
          ? null
          : inTrash
            ? t('groupRecentlyCleared')
            : groupLabel(groupFor(note.updatedAt, note.pinned));
        const showHeading = group !== null && group !== lastGroup;
        if (showHeading) lastGroup = group;

        return (
          <div key={note.id}>
            {showHeading ? <GroupHeading label={group} /> : null}
            <NoteItem
              note={note}
              terms={terms}
              view={view}
              inTrash={inTrash}
              retentionDays={retentionDays}
              tags={tags}
              actions={actions}
            />
          </div>
        );
      })}
    </div>
  );
}

function GroupHeading({ label }: { label: string }) {
  return (
    <h2 className="mt-3 mb-1 text-[11px] tracking-wider text-muted uppercase">{label}</h2>
  );
}
