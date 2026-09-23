import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NotebookPen, Settings2, X } from 'lucide-react';

import { copyText } from '../lib/clipboard';
import type { HostBridge } from '../lib/host';
import type { ExtensionMessage } from '../lib/messages';
import {
  clearableNotes,
  clearUnpinned,
  createNote,
  deleteForever,
  editNote,
  isActive,
  isTrashed,
  purgeExpiredTrash,
  restoreMany,
  restoreNote,
  saveConflictCopy,
  setPinned,
  sortNotes,
  trashNote,
} from '../lib/notes';
import { DEFAULT_SETTINGS, type Note, type Settings } from '../lib/schema';
import { parseQuery } from '../lib/search';
import { QUOTA_WARN_RATIO, type WriteResult } from '../lib/storage';
import { applyTheme } from '../lib/theme';
import { formatBytes } from '../lib/time';

import { EmptyState, type EmptyKind } from './components/EmptyState';
import { FilterBar, type View } from './components/FilterBar';
import { NoteEditor, type EditorValue, type SaveError, type SaveState } from './components/NoteEditor';
import { NoteList } from './components/NoteList';
import type { NoteView } from './components/NoteItem';
import { StatusBar, type StatusAction } from './components/StatusBar';
import { store } from './store';

const DRAFT_DEBOUNCE_MS = 400;
const SAVED_STATE_MS = 2200;
const NOTE_VIEW_KEY = 'for-now:note-view';

const EMPTY_VALUE: EditorValue = { html: '', text: '' };

interface EditTarget {
  id: string;
  /** The revision the edit started from, used to detect a stale write. */
  rev: number;
}

/** Turn a failed write into something worth reading in the panel. */
function explain(result: Extract<WriteResult<unknown>, { ok: false }>): string {
  if (result.reason === 'quota') {
    return 'Not saved — this device is out of space for notes. Export a backup from Settings, then clear some notes.';
  }
  return `Not saved — ${result.message}`;
}

/** The layout choice is a per-viewer convenience, so it lives in the browser. */
function loadNoteView(): NoteView {
  try {
    return localStorage.getItem(NOTE_VIEW_KEY) === 'card' ? 'card' : 'list';
  } catch {
    return 'list';
  }
}

export function App({ host }: { host: HostBridge }) {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [usageRatio, setUsageRatio] = useState(0);
  const [usageBytes, setUsageBytes] = useState(0);

  const [value, setValue] = useState<EditorValue>(EMPTY_VALUE);
  /**
   * Bumped whenever the app replaces the editor's content rather than the
   * user typing it. The editor watches this instead of the content itself.
   */
  const [contentToken, setContentToken] = useState(0);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [draftSaved, setDraftSaved] = useState(false);

  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<SaveError | null>(null);
  const [conflictNote, setConflictNote] = useState<Note | null>(null);

  const [query, setQuery] = useState('');
  const [view, setView] = useState<View>('all');
  const [noteView, setNoteView] = useState<NoteView>(loadNoteView);
  const [status, setStatus] = useState('');
  const [statusAction, setStatusAction] = useState<StatusAction | undefined>();
  const [confirmClear, setConfirmClear] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  /** Guards the draft autosave so hydration does not write the draft back. */
  const hydrated = useRef(false);

  // ---------------------------------------------------------------------
  // Loading and syncing
  // ---------------------------------------------------------------------

  const refresh = useCallback(async () => {
    const [loaded, usage] = await Promise.all([store.listNotes(), store.usage()]);
    setNotes(loaded);
    setUsageRatio(usage.ratio);
    setUsageBytes(usage.bytes);
  }, []);

  useEffect(() => {
    void (async () => {
      const loadedSettings = await store.getSettings();
      setSettings(loadedSettings);
      applyTheme(loadedSettings.theme, host.themeRoot);

      const draft = await store.getDraft();
      pushContent({ html: draft.html, text: draft.text });
      if (draft.editingId && draft.editingRev !== undefined) {
        setEditTarget({ id: draft.editingId, rev: draft.editingRev });
      }
      setDraftSaved(draft.text.trim().length > 0);

      // Opportunistic: the alarms permission is not worth a timer for this.
      await purgeExpiredTrash(store, loadedSettings.trashRetentionDays);
      await refresh();
      hydrated.current = true;
    })();
  }, [refresh]);

  // Another window (or the service worker) changing storage refreshes this one.
  useEffect(() => {
    const onChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area !== 'local') return;
      const keys = Object.keys(changes);
      if (keys.some((key) => key.startsWith('note:'))) void refresh();
      if (keys.includes('settings')) {
        void store.getSettings().then((next) => {
          setSettings(next);
          applyTheme(next.theme, host.themeRoot);
        });
      }
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, [refresh, host]);

  // Confirmation for captures made from the context menu while the panel is open.
  useEffect(() => {
    const onMessage = (message: ExtensionMessage) => {
      if (message.type === 'capture-saved') {
        setView('all');
        setQuery('');
        announce('Saved on this device.');
        void refresh();
      } else if (message.type === 'capture-failed') {
        announce(message.message);
      }
    };
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, [refresh]);

  // Persist the draft shortly after typing stops, so closing the panel or
  // letting the worker sleep does not lose an unfinished thought.
  useEffect(() => {
    if (!hydrated.current) return;
    const timer = window.setTimeout(() => {
      void (async () => {
        if (!value.text.trim()) {
          await store.clearDraft();
          setDraftSaved(false);
          return;
        }
        const result = await store.setDraft({
          html: value.html,
          text: value.text,
          editingId: editTarget?.id,
          editingRev: editTarget?.rev,
          updatedAt: Date.now(),
        });
        setDraftSaved(result.ok);
      })();
    }, DRAFT_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [value, editTarget]);

  // Let "Saved" fade back to the resting message rather than lingering.
  useEffect(() => {
    if (saveState !== 'saved') return;
    const timer = window.setTimeout(() => setSaveState('idle'), SAVED_STATE_MS);
    return () => window.clearTimeout(timer);
  }, [saveState]);

  // ---------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------

  const terms = useMemo(() => parseQuery(query), [query]);
  const allNotes = notes ?? [];
  const active = useMemo(() => allNotes.filter(isActive), [allNotes]);
  const trashed = useMemo(() => allNotes.filter(isTrashed), [allNotes]);

  const counts: Record<View, number> = {
    all: active.length,
    pinned: active.filter((note) => note.pinned).length,
    trash: trashed.length,
  };

  const visible = useMemo(() => {
    const pool =
      view === 'trash' ? trashed : view === 'pinned' ? active.filter((n) => n.pinned) : active;
    const filtered =
      terms.length === 0
        ? pool
        : pool.filter((note) => {
            const haystack = [
              note.text,
              note.sourceTitle ?? '',
              note.sourceUrl ?? '',
              note.targetUrl ?? '',
            ]
              .join('\n')
              .toLowerCase();
            return terms.every((term) => haystack.includes(term));
          });
    return sortNotes(filtered);
  }, [view, terms, active, trashed]);

  const clearable = useMemo(() => clearableNotes(active), [active]);
  const searching = terms.length > 0;

  // ---------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------

  function announce(message: string, action?: StatusAction) {
    setStatus(message);
    setStatusAction(action);
  }

  /** Replace what is in the editor, and tell the editor to reload it. */
  function pushContent(next: EditorValue) {
    setValue(next);
    setContentToken((token) => token + 1);
  }

  function resetComposer() {
    pushContent(EMPTY_VALUE);
    setEditTarget(null);
    setSaveError(null);
    setConflictNote(null);
    void store.clearDraft();
    setDraftSaved(false);
  }

  const commit = useCallback(async () => {
    const current = value;
    if (!current.text.trim()) return;

    setSaveState('saving');
    setSaveError(null);
    setConflictNote(null);

    const result = editTarget
      ? await editNote(store, editTarget.id, current, editTarget.rev)
      : await createNote(store, { ...current, kind: 'thought' });

    if (result.ok) {
      resetComposer();
      setSaveState('saved');
      setView('all');
      announce(editTarget ? 'Changes saved on this device.' : 'Saved on this device.');
    } else if (result.reason === 'conflict') {
      setSaveState('error');
      setConflictNote(result.conflict ?? null);
      setSaveError({
        message:
          'This note changed in another window while you were editing. Your text is still here.',
        conflict: true,
      });
    } else {
      setSaveState('error');
      setSaveError({ message: explain(result) });
    }
    await refresh();
  }, [value, editTarget, refresh]);

  async function keepBoth() {
    if (!conflictNote) return;
    setSaveState('saving');
    const result = await saveConflictCopy(store, conflictNote, value.html, value.text);
    if (result.ok) {
      resetComposer();
      setSaveState('saved');
      announce('Kept as a separate note. Both versions are in your notes.');
    } else {
      setSaveState('error');
      setSaveError({ message: explain(result) });
    }
    await refresh();
  }

  function beginEdit(note: Note) {
    setQuery('');
    pushContent({ html: note.html, text: note.text });
    setEditTarget({ id: note.id, rev: note.rev });
    setSaveError(null);
    setSaveState('idle');
    announce('');
  }

  async function copyNote(note: Note) {
    const copied = await copyText(note.text);
    announce(copied ? 'Copied to the clipboard.' : 'Could not copy. Select the text instead.');
  }

  async function togglePin(note: Note) {
    const result = await setPinned(store, note.id, !note.pinned);
    announce(
      result.ok
        ? note.pinned
          ? 'Unpinned.'
          : 'Pinned. Bulk cleanup will skip this note.'
        : explain(result),
    );
    await refresh();
  }

  async function moveToTrash(note: Note) {
    const result = await trashNote(store, note.id);
    if (!result.ok) {
      announce(explain(result));
      return;
    }
    announce(`Moved to Trash · recover for ${settings.trashRetentionDays} days`, {
      label: 'Undo',
      onClick: () => void undoTrash([note.id]),
    });
    await refresh();
  }

  async function undoTrash(ids: string[]) {
    const result = await restoreMany(store, ids);
    announce(result.ok ? 'Restored.' : explain(result));
    await refresh();
  }

  async function restore(note: Note) {
    const result = await restoreNote(store, note.id);
    announce(result.ok ? 'Restored to your notes.' : explain(result));
    await refresh();
  }

  async function removeForever(note: Note) {
    const result = await deleteForever(store, [note.id]);
    announce(result.ok ? 'Deleted. That one cannot be recovered.' : explain(result));
    await refresh();
  }

  async function doClearUnpinned() {
    setConfirmClear(false);
    const result = await clearUnpinned(store, active);
    if (!result.ok) {
      announce(explain(result));
      return;
    }
    const ids = result.value;
    announce(
      `${ids.length} ${ids.length === 1 ? 'note' : 'notes'} moved to Trash · recover for ${settings.trashRetentionDays} days`,
      { label: 'Undo', onClick: () => void undoTrash(ids) },
    );
    await refresh();
  }

  function openSource(url: string) {
    void host.openTab(url).then((ok) => {
      if (!ok) announce('Could not open that page.');
    });
  }

  function changeNoteView(next: NoteView) {
    setNoteView(next);
    try {
      localStorage.setItem(NOTE_VIEW_KEY, next);
    } catch {
      // A blocked storage write only costs the preference, not the view.
    }
  }

  /**
   * Starting a search is a new intention, so a confirmation left over from the
   * previous action is dismissed rather than left sitting under the results.
   */
  function changeQuery(next: string) {
    setQuery(next);
    if (next && status) announce('');
  }

  // ---------------------------------------------------------------------
  // Keyboard
  // ---------------------------------------------------------------------

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (event.key !== 'Escape') return;

      // Escape peels back one layer at a time, and only closes the panel when
      // there is nothing left to dismiss.
      if (saveError) {
        setSaveError(null);
        setSaveState('idle');
      } else if (confirmClear) {
        setConfirmClear(false);
      } else if (editTarget) {
        resetComposer();
        announce('Edit cancelled. The original note is unchanged.');
      } else if (query) {
        setQuery('');
      } else if (status) {
        announce('');
      } else {
        host.requestClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [saveError, confirmClear, editTarget, query, status, host]);

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------

  const emptyKind: EmptyKind = searching ? 'search' : view;
  const nearQuota = usageRatio >= QUOTA_WARN_RATIO;

  return (
    <div className="flex h-full min-h-0 flex-col bg-paper text-ink">
      {/* One compact row. Everything else in the panel is content. */}
      <header className="flex shrink-0 items-center justify-between gap-2 px-3 py-1.5">
        <span className="flex items-center gap-1.5 text-sm font-semibold tracking-tight">
          <NotebookPen size={15} aria-hidden="true" className="text-accent" />
          For Now
        </span>
        <div className="flex gap-px">
          <button
            type="button"
            className="fn-tool"
            aria-label="Settings and backup"
            title="Settings and backup"
            onClick={() =>
              void host.openOptions().then((ok) => {
                if (!ok) announce('Could not open settings. Try the extension menu in Chrome.');
              })
            }
          >
            <Settings2 size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="fn-tool"
            aria-label="Close side panel"
            title="Close side panel"
            onClick={() => host.requestClose()}
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      </header>

      {nearQuota ? (
        <div role="alert" className="mx-3 mb-2 rounded-md bg-warning-bg p-2 text-xs text-warning">
          Notes are using {formatBytes(usageBytes)} of the 10 MB this device allows. Export a
          backup and clear what you no longer need.
        </div>
      ) : null}

      {/* The editor is the dominant surface, but capped at half the panel so
          a scratchpad never becomes a word processor with a footnote of
          notes. Both regions have a floor as well as a ceiling. */}
      <div className="flex max-h-[50%] min-h-[11rem] flex-[3] flex-col">
        <NoteEditor
          value={value}
          contentKey={`${editTarget?.id ?? 'new'}#${contentToken}`}
          editingId={editTarget?.id ?? null}
          saveState={saveState}
          saveError={saveError}
          draftSaved={draftSaved}
          onChange={setValue}
          onCommit={() => void commit()}
          onCancelEdit={() => {
            resetComposer();
            announce('Edit cancelled. The original note is unchanged.');
          }}
          onRetry={() => void commit()}
          onCopyDraft={() =>
            void copyText(value.text).then((ok) =>
              announce(ok ? 'Draft copied to the clipboard.' : 'Could not copy the draft.'),
            )
          }
          onKeepBoth={() => void keepBoth()}
        />
      </div>

      <FilterBar
        view={view}
        counts={counts}
        query={query}
        noteView={noteView}
        searchRef={searchRef}
        onChangeView={(next) => {
          setView(next);
          setConfirmClear(false);
        }}
        onChangeQuery={changeQuery}
        onChangeNoteView={changeNoteView}
      />

      <div className="min-h-[8rem] flex-[2] overflow-y-auto">
        {notes === null ? (
          <p className="px-4 py-8 text-center text-xs text-muted">Loading your notes…</p>
        ) : visible.length === 0 ? (
          <EmptyState
            kind={emptyKind}
            action={
              searching ? { label: 'Clear search', onClick: () => changeQuery('') } : undefined
            }
          />
        ) : (
          <NoteList
            notes={visible}
            terms={terms}
            view={noteView}
            inTrash={view === 'trash'}
            retentionDays={settings.trashRetentionDays}
            actions={{
              onEdit: beginEdit,
              onCopy: (note) => void copyNote(note),
              onTogglePin: (note) => void togglePin(note),
              onTrash: (note) => void moveToTrash(note),
              onRestore: (note) => void restore(note),
              onDeleteForever: (note) => void removeForever(note),
              onOpenSource: openSource,
            }}
          />
        )}
      </div>

      {confirmClear ? (
        <div className="mx-3 mb-2 rounded-md bg-soft p-2.5 text-xs">
          <p className="mb-2">
            Move {clearable.length} unpinned {clearable.length === 1 ? 'note' : 'notes'} to Trash?
            Pinned notes stay. You can undo this.
          </p>
          <div className="flex gap-1.5">
            <button
              type="button"
              className="fn-btn fn-btn-primary fn-btn-small"
              onClick={() => void doClearUnpinned()}
            >
              Move to Trash
            </button>
            <button
              type="button"
              className="fn-btn fn-btn-small"
              onClick={() => setConfirmClear(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <StatusBar message={status} action={statusAction} />
      )}

      <footer className="flex shrink-0 items-center justify-between gap-1.5 border-t border-line px-3 py-1.5 text-[11px] text-muted">
        <span>
          {view === 'trash'
            ? `${counts.trash} in Trash`
            : `${counts.all} ${counts.all === 1 ? 'note' : 'notes'} · on this device`}
        </span>
        {view !== 'trash' && !searching && clearable.length > 0 ? (
          <button
            type="button"
            className="fn-btn fn-btn-quiet fn-btn-small"
            onClick={() => setConfirmClear(true)}
          >
            Clear unpinned…
          </button>
        ) : null}
      </footer>
    </div>
  );
}
