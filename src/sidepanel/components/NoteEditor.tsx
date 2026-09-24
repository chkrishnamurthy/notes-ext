import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Maximize2, Minimize2 } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';

import { EditorToolbar } from './EditorToolbar';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export interface SaveError {
  message: string;
  /** Present when the note changed in another window mid-edit. */
  conflict?: boolean;
}

export interface EditorValue {
  html: string;
  text: string;
}

/**
 * The note editor: a TipTap surface plus its toolbar.
 *
 * TipTap owns the document while you are typing; the parent is told about
 * every change so the draft can be persisted and the note committed. The
 * parent only pushes content back in when it changes the note being edited,
 * because writing into the editor on every keystroke would fight the cursor.
 */
export function NoteEditor({
  value,
  contentKey,
  editingId,
  saveState,
  saveError,
  draftSaved,
  onChange,
  onCommit,
  onCancelEdit,
  onRetry,
  onCopyDraft,
  onKeepBoth,
  onEditorReady,
  listCollapsed,
  onToggleList,
}: {
  value: EditorValue;
  /**
   * Changes only when the parent deliberately replaces the content — loading a
   * restored draft, opening a note to edit, clearing after a save. Comparing
   * `value.html` instead would either miss the load that arrives after mount
   * or fight the cursor on every keystroke.
   */
  contentKey: string;
  /** Null when composing a new note; the note id when editing one. */
  editingId: string | null;
  saveState: SaveState;
  saveError: SaveError | null;
  draftSaved: boolean;
  onChange: (value: EditorValue) => void;
  onCommit: () => void;
  onCancelEdit: () => void;
  onRetry: () => void;
  onCopyDraft: () => void;
  onKeepBoth: () => void;
  onEditorReady?: (editor: Editor | null) => void;
  /** Whether the notes list below is folded away; absent hides the toggle. */
  listCollapsed?: boolean;
  onToggleList?: () => void;
}) {
  const editing = editingId !== null;
  // Committing reads the latest content, so the handler is kept in a ref
  // rather than rebuilding the editor whenever the parent re-renders.
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2] },
        // The panel is narrow; a horizontal rule adds noise and no meaning.
        horizontalRule: false,
        link: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        // Typing a bare URL should become a link; pasting one over a selection
        // should link the selection, both of which match Jira.
        protocols: ['http', 'https', 'mailto'],
        HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({
        placeholder: 'Keep it here for now. Type “- ” for a list, “# ” for a heading.',
      }),
    ],
    content: value.html,
    editorProps: {
      attributes: {
        class: 'fn-prose',
        'aria-label': 'Note body',
        'aria-keyshortcuts': 'Control+Enter Meta+Enter',
      },
      handleKeyDown: (_view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          event.preventDefault();
          commitRef.current();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: instance }) => {
      onChange({ html: instance.getHTML(), text: instance.getText() });
    },
  });

  useEffect(() => {
    onEditorReady?.(editor);
    return () => onEditorReady?.(null);
  }, [editor, onEditorReady]);

  // Push content in only when the parent says the content changed underneath.
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!editor) return;
    if (loadedFor.current === contentKey) return;
    loadedFor.current = contentKey;
    editor.commands.setContent(value.html, { emitUpdate: false });
    if (editing) editor.commands.focus('end');
  }, [editor, contentKey, editing, value.html]);

  const addLink = useCallback(() => {
    if (!editor) return;
    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const previous = (editor.getAttributes('link').href as string | undefined) ?? 'https://';
    const entered = window.prompt('Link address', previous);
    if (entered === null) return;
    const href = entered.trim();
    if (!href) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    if (!/^(https?:|mailto:)/i.test(href)) {
      window.alert('Links must start with http://, https:// or mailto:.');
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
  }, [editor]);

  const empty = editor?.isEmpty ?? value.text.trim().length === 0;
  const canCommit = !empty && saveState !== 'saving';

  const status = (() => {
    if (saveState === 'saving') return 'Saving…';
    if (saveState === 'error') return 'Not saved. Your text is still here.';
    if (saveState === 'saved') return 'Saved on this device.';
    if (editing) return 'The original note is kept until you save changes.';
    if (draftSaved) return 'Draft saved on this device.';
    return 'Notes stay until you clear them.';
  })();

  return (
    <section
      aria-label={editing ? 'Edit note' : 'New note'}
      className="fn-editor flex min-h-0 flex-1 flex-col overflow-hidden border-b border-line"
    >
      <EditorToolbar editor={editor} onAddLink={addLink} />

      {/* The editor is the tallest thing in the panel and scrolls on its own,
          so a long note never pushes the Add button out of reach. The whole
          area is the writing surface: the editable element fills it, and a
          click on the padding around it still puts the caret in the note. */}
      <div
        className="flex min-h-0 flex-1 cursor-text flex-col overflow-y-auto px-4 py-3"
        onMouseDown={(event) => {
          if (!editor || event.target !== event.currentTarget) return;
          // Without this the click would land on the wrapper and blur the
          // editor straight after we focus it.
          event.preventDefault();
          editor.commands.focus('end');
        }}
      >
        <EditorContent editor={editor} className="flex flex-1 flex-col" />
      </div>

      {saveError ? (
        <div role="alert" className="mx-4 mb-2 rounded-md bg-warning-bg p-2.5 text-xs text-warning">
          <p>{saveError.message}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {saveError.conflict ? (
              <button type="button" className="fn-btn fn-btn-small" onClick={onKeepBoth}>
                Save mine as a separate note
              </button>
            ) : (
              <button type="button" className="fn-btn fn-btn-small" onClick={onRetry}>
                Retry save
              </button>
            )}
            <button type="button" className="fn-btn fn-btn-small" onClick={onCopyDraft}>
              Copy draft
            </button>
          </div>
        </div>
      ) : null}

      {/* Actions sit below the writing surface, outside it. Three columns so
          the list toggle stays centred on the panel whatever the status text
          and buttons on either side of it measure. */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-2.5">
        <p id="fn-draft-status" className="min-w-0 truncate text-[11px] text-muted">
          {status}
        </p>
        {onToggleList ? (
          <button
            type="button"
            className="fn-tool"
            aria-label={listCollapsed ? 'Show notes list' : 'Expand writing area'}
            aria-expanded={!listCollapsed}
            title={listCollapsed ? 'Show notes list' : 'Expand writing area (hides the notes list)'}
            onClick={onToggleList}
          >
            {listCollapsed ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
          </button>
        ) : (
          <span />
        )}
        <div className="flex items-center justify-end gap-1.5">
          {editing ? (
            <button type="button" className="fn-btn fn-btn-small" onClick={onCancelEdit}>
              Cancel
            </button>
          ) : null}
          <button
            type="button"
            className="fn-btn fn-btn-primary"
            disabled={!canCommit}
            onClick={onCommit}
          >
            {saveState === 'saving' ? 'Saving…' : editing ? 'Save changes' : 'Add note'}
          </button>
        </div>
      </div>
    </section>
  );
}
