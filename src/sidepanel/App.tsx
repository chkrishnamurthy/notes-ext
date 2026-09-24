import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NotebookPen, Settings2, X } from 'lucide-react';

import { copyText } from '../lib/clipboard';
import { EMPTY_SNAPSHOT, sameDraft, shouldAdopt, type DraftSnapshot } from '../lib/draftSync';
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
  setTag,
  sortNotes,
  tagsInUse,
  trashNote,
} from '../lib/notes';
import { plural, t } from '../lib/i18n';
import { htmlToMarkdown } from '../lib/markdown';
import {
  DEFAULT_SETTINGS,
  DRAFT_KEY,
  NOTE_PREFIX,
  isNoteKey,
  parseDraft,
  parseNote,
  sameTag,
  type Note,
  type Settings,
} from '../lib/schema';
import { matchesNote, parseQuery } from '../lib/search';
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
const LIST_COLLAPSED_KEY = 'for-now:list-collapsed';

const EMPTY_VALUE: EditorValue = { html: '', text: '' };

interface EditTarget {
  id: string;
  /** The note's content revision when the edit began, to detect a stale write. */
  rev: number;
}

/** Turn a failed write into something worth reading in the panel. */
function explain(result: Extract<WriteResult<unknown>, { ok: false }>): string {
  if (result.reason === 'quota') {
    return t('notSavedQuota');
  }
  return t('notSavedReason', result.message);
}

/** The layout choice is a per-viewer convenience, so it lives in the browser. */
function loadNoteView(): NoteView {
  try {
    return localStorage.getItem(NOTE_VIEW_KEY) === 'card' ? 'card' : 'list';
  } catch {
    return 'list';
  }
}

/** Whether the notes list is folded away to give the editor the whole panel. */
function loadListCollapsed(): boolean {
  try {
    return localStorage.getItem(LIST_COLLAPSED_KEY) === 'true';
  } catch {
    return false;
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
  /** Set by clicking a note's tag: the list shows only notes with that tag. */
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [view, setView] = useState<View>('all');
  const [noteView, setNoteView] = useState<NoteView>(loadNoteView);
  const [status, setStatus] = useState('');
  const [statusAction, setStatusAction] = useState<StatusAction | undefined>();
  const [confirmClear, setConfirmClear] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const [listCollapsed, setListCollapsed] = useState(loadListCollapsed);
  /** Guards the draft autosave so hydration does not write the draft back. */
  const hydrated = useRef(false);
  /** What this panel last wrote to, or adopted from, the shared draft. */
  const synced = useRef<DraftSnapshot>(EMPTY_SNAPSHOT);
  /** The composer as it stands, for the storage listener to compare against. */
  const local = useRef<DraftSnapshot>(EMPTY_SNAPSHOT);
  local.current = { html: value.html, editingId: editTarget?.id, editingRev: editTarget?.rev };

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
      applyTheme(loadedSettings, host.themeRoot);

      const draft = await store.getDraft();
      synced.current = { html: draft.html, editingId: draft.editingId, editingRev: draft.editingRev };
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
      const noteKeys = keys.filter(isNoteKey);
      if (noteKeys.length > 0) {
        // Apply just the notes that changed. With an overlay open in every tab,
        // re-reading the whole store in each of them on every write adds up.
        setNotes((previous) => {
          if (!previous) return previous;
          const byId = new Map(previous.map((note) => [note.id, note]));
          for (const key of noteKeys) {
            const id = key.slice(NOTE_PREFIX.length);
            const next = changes[key].newValue;
            if (next === undefined) {
              byId.delete(id);
              continue;
            }
            const note = parseNote(next);
            if (note) byId.set(id, note);
          }
          return [...byId.values()];
        });
        void store.usage().then((usage) => {
          setUsageRatio(usage.ratio);
          setUsageBytes(usage.bytes);
        });
      }
      // The draft is shared by every open panel; follow another panel's typing
      // unless this one has typing of its own still to write.
      if (keys.includes(DRAFT_KEY) && hydrated.current) {
        const incoming = parseDraft(changes[DRAFT_KEY].newValue);
        const snapshot: DraftSnapshot = {
          html: incoming.html,
          editingId: incoming.editingId,
          editingRev: incoming.editingRev,
        };
        if (shouldAdopt(snapshot, synced.current, local.current)) {
          synced.current = snapshot;
          pushContent({ html: incoming.html, text: incoming.text });
          setEditTarget(
            incoming.editingId && incoming.editingRev !== undefined
              ? { id: incoming.editingId, rev: incoming.editingRev }
              : null,
          );
          setDraftSaved(incoming.text.trim().length > 0);
        }
      }
      if (keys.includes('settings')) {
        void store.getSettings().then((next) => {
          setSettings(next);
          applyTheme(next, host.themeRoot);
        });
      }
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, [host]);

  // Confirmation for captures made from the context menu while the panel is open.
  useEffect(() => {
    const onMessage = (message: ExtensionMessage) => {
      if (message.type === 'capture-saved') {
        setView('all');
        setQuery('');
        announce(t('savedOnDevice'));
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
    const snapshot: DraftSnapshot = {
      html: value.html,
      editingId: editTarget?.id,
      editingRev: editTarget?.rev,
    };
    // Already in storage: either this panel wrote it, or it was just adopted
    // from another panel — writing it back would only bounce between them.
    if (sameDraft(snapshot, synced.current)) return;
    const timer = window.setTimeout(() => {
      void (async () => {
        if (!value.text.trim()) {
          synced.current = EMPTY_SNAPSHOT;
          await store.clearDraft();
          setDraftSaved(false);
          return;
        }
        // Recorded before the write, so its echo is recognised as this panel's.
        synced.current = snapshot;
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
    const filtered = pool.filter(
      (note) =>
        (tagFilter === null || sameTag(note.tag, tagFilter)) && matchesNote(note, terms),
    );
    return sortNotes(filtered);
  }, [view, terms, tagFilter, active, trashed]);

  const tags = useMemo(() => tagsInUse(active), [active]);

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
    synced.current = EMPTY_SNAPSHOT;
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
      announce(editTarget ? t('changesSaved') : t('savedOnDevice'));
    } else if (result.reason === 'conflict') {
      setSaveState('error');
      setConflictNote(result.conflict ?? null);
      setSaveError({
        // The store says which: the text changed, or the note went to Trash.
        message: t('conflictKeepText', result.message),
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
      announce(t('keptSeparate'));
    } else {
      setSaveState('error');
      setSaveError({ message: explain(result) });
    }
    await refresh();
  }

  function beginEdit(note: Note) {
    setQuery('');
    pushContent({ html: note.html, text: note.text });
    setEditTarget({ id: note.id, rev: note.contentRev });
    setSaveError(null);
    setSaveState('idle');
    announce('');
  }

  async function copyNote(note: Note) {
    const copied = await copyText(note.text);
    announce(copied ? t('copied') : t('copyFailed'));
  }

  async function copyMarkdown(note: Note) {
    const copied = await copyText(htmlToMarkdown(note.html));
    announce(copied ? t('copiedMarkdown') : t('copyFailed'));
  }

  async function changeTag(note: Note, tag: string | undefined) {
    const result = await setTag(store, note.id, tag);
    announce(
      result.ok
        ? result.value.tag
          ? t('tagged', result.value.tag)
          : t('tagRemoved')
        : explain(result),
    );
    await refresh();
  }

  async function togglePin(note: Note) {
    const result = await setPinned(store, note.id, !note.pinned);
    announce(
      result.ok
        ? note.pinned
          ? t('unpinned')
          : t('pinnedSkip')
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
    announce(t('movedToTrash', settings.trashRetentionDays), {
      label: t('undo'),
      onClick: () => void undoTrash([note.id]),
    });
    await refresh();
  }

  async function undoTrash(ids: string[]) {
    const result = await restoreMany(store, ids);
    announce(result.ok ? t('restored') : explain(result));
    await refresh();
  }

  async function restore(note: Note) {
    const result = await restoreNote(store, note.id);
    announce(result.ok ? t('restoredToNotes') : explain(result));
    await refresh();
  }

  async function removeForever(note: Note) {
    const result = await deleteForever(store, [note.id]);
    announce(result.ok ? t('deletedForever') : explain(result));
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
      plural(ids.length, 'movedManyOne', 'movedManyOther', settings.trashRetentionDays),
      { label: t('undo'), onClick: () => void undoTrash(ids) },
    );
    await refresh();
  }

  function openSource(url: string) {
    void host.openTab(url).then((ok) => {
      if (!ok) announce(t('openPageFailed'));
    });
  }

  function changeListCollapsed(next: boolean) {
    setListCollapsed(next);
    try {
      localStorage.setItem(LIST_COLLAPSED_KEY, String(next));
    } catch {
      // As with the note view: only the preference is lost.
    }
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
        // Search lives in the list, so asking for it brings the list back.
        if (listCollapsed) changeListCollapsed(false);
        requestAnimationFrame(() => {
          searchRef.current?.focus();
          searchRef.current?.select();
        });
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
        announce(t('editCancelled'));
      } else if (query) {
        setQuery('');
      } else if (tagFilter) {
        setTagFilter(null);
      } else if (status) {
        announce('');
      } else {
        host.requestClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [saveError, confirmClear, editTarget, query, tagFilter, status, host, listCollapsed]);

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------

  const filtering = searching || tagFilter !== null;
  const emptyKind: EmptyKind = filtering ? 'search' : view;
  const nearQuota = usageRatio >= QUOTA_WARN_RATIO;

  return (
    <div className="flex h-full min-h-0 flex-col bg-paper text-ink">
      {/* One compact row. Everything else in the panel is content. */}
      <header className="flex shrink-0 items-center justify-between gap-2 px-3 py-2">
        <span className="flex items-center gap-2 text-base font-semibold tracking-tight">
          <NotebookPen size={19} aria-hidden="true" className="text-accent" />
          {t('extName')}
        </span>
        <div className="flex gap-0.5">
          <button
            type="button"
            className="fn-tool fn-tool-header"
            aria-label={t('settingsAndBackup')}
            title={t('settingsAndBackup')}
            onClick={() =>
              void host.openOptions().then((ok) => {
                if (!ok) announce(t('settingsOpenFailed'));
              })
            }
          >
            <Settings2 size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="fn-tool fn-tool-header"
            aria-label={t('closeNotes')}
            title={t('closeNotes')}
            onClick={() => host.requestClose()}
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      </header>

      {nearQuota ? (
        <div role="alert" className="mx-3 mb-2 rounded-md bg-warning-bg p-2 text-xs text-warning">
          {t('nearQuota', formatBytes(usageBytes))}
        </div>
      ) : null}

      {/* The editor is the dominant surface, but capped at half the panel so
          a scratchpad never becomes a word processor with a footnote of
          notes. Both regions have a floor as well as a ceiling. With the list
          collapsed, the cap comes off and the editor takes the whole panel. */}
      <div
        className={
          listCollapsed
            ? 'flex min-h-[11rem] flex-1 flex-col'
            : 'flex max-h-[50%] min-h-[11rem] flex-[3] flex-col'
        }
      >
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
            announce(t('editCancelled'));
          }}
          onRetry={() => void commit()}
          onCopyDraft={() =>
            void copyText(value.text).then((ok) =>
              announce(ok ? t('draftCopied') : t('draftCopyFailed')),
            )
          }
          onKeepBoth={() => void keepBoth()}
          listCollapsed={listCollapsed}
          onToggleList={() => changeListCollapsed(!listCollapsed)}
        />
      </div>

      {listCollapsed ? null : (
        <>
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

          {tagFilter ? (
            <div className="flex items-center gap-1.5 border-b border-line px-3 py-1 text-xs text-muted">
              <span className="font-medium text-accent">{t('taggedFilter', `#${tagFilter}`)}</span>
              <button
                type="button"
                className="fn-tool"
                aria-label={t('stopTagFilter', tagFilter)}
                title={t('showAllTags')}
                onClick={() => setTagFilter(null)}
              >
                <X size={13} aria-hidden="true" />
              </button>
            </div>
          ) : null}

          <div className="min-h-[8rem] flex-[2] overflow-y-auto">
            {notes === null ? (
              <p className="px-4 py-8 text-center text-xs text-muted">{t('loadingNotes')}</p>
            ) : visible.length === 0 ? (
              <EmptyState
                kind={emptyKind}
                action={
                  searching
                    ? { label: t('clearSearch'), onClick: () => changeQuery('') }
                    : tagFilter
                      ? { label: t('showAllTags'), onClick: () => setTagFilter(null) }
                      : undefined
                }
              />
            ) : (
              <NoteList
                notes={visible}
                terms={terms}
                view={noteView}
                inTrash={view === 'trash'}
                retentionDays={settings.trashRetentionDays}
                tags={tags}
                actions={{
                  onEdit: beginEdit,
                  onCopy: (note) => void copyNote(note),
                  onCopyMarkdown: (note) => void copyMarkdown(note),
                  onSetTag: (note, tag) => void changeTag(note, tag),
                  onFilterTag: (tag) => {
                    setTagFilter(tag);
                    announce('');
                  },
                  onTogglePin: (note) => void togglePin(note),
                  onTrash: (note) => void moveToTrash(note),
                  onRestore: (note) => void restore(note),
                  onDeleteForever: (note) => void removeForever(note),
                  onOpenSource: openSource,
                }}
              />
            )}
          </div>
        </>
      )}

      {confirmClear ? (
        <div className="mx-3 mb-2 rounded-md bg-soft p-2.5 text-xs">
          <p className="mb-2">
            {plural(clearable.length, 'confirmClearOne', 'confirmClearOther')}
          </p>
          <div className="flex gap-1.5">
            <button
              type="button"
              className="fn-btn fn-btn-primary fn-btn-small"
              onClick={() => void doClearUnpinned()}
            >
              {t('moveToTrash')}
            </button>
            <button
              type="button"
              className="fn-btn fn-btn-small"
              onClick={() => setConfirmClear(false)}
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      ) : (
        <StatusBar message={status} action={statusAction} />
      )}

      <footer className="flex shrink-0 items-center justify-between gap-1.5 border-t border-line px-3 py-1.5 text-[11px] text-muted">
        <span>
          {view === 'trash'
            ? t('inTrashCount', counts.trash)
            : plural(counts.all, 'notesOnDeviceOne', 'notesOnDeviceOther')}
        </span>
        {view !== 'trash' && !searching && clearable.length > 0 ? (
          <button
            type="button"
            className="fn-btn fn-btn-quiet fn-btn-small"
            onClick={() => setConfirmClear(true)}
          >
            {t('clearUnpinned')}
          </button>
        ) : null}
      </footer>
    </div>
  );
}
