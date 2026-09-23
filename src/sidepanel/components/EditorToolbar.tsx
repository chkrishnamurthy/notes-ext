import type { Editor } from '@tiptap/react';
import {
  Bold, Code, CodeSquare, Heading1, Heading2, Italic, Link2, Link2Off,
  List, ListOrdered, ListTodo, Quote, Redo2, Strikethrough, Undo2,
} from 'lucide-react';
import type { ComponentType } from 'react';

/**
 * The formatting toolbar.
 *
 * It mirrors the set Jira offers, because that is the reference the user
 * named. Every control is also reachable by its own keyboard shortcut and by
 * the markdown-style input rules, so the toolbar is a reminder rather than the
 * only route to formatting.
 */

interface Tool {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean }>;
  shortcut?: string;
  run: (editor: Editor) => void;
  active?: (editor: Editor) => boolean;
  enabled?: (editor: Editor) => boolean;
}

const GROUPS: Tool[][] = [
  [
    {
      id: 'bold',
      label: 'Bold',
      shortcut: 'Mod+B',
      icon: Bold,
      run: (e) => e.chain().focus().toggleBold().run(),
      active: (e) => e.isActive('bold'),
    },
    {
      id: 'italic',
      label: 'Italic',
      shortcut: 'Mod+I',
      icon: Italic,
      run: (e) => e.chain().focus().toggleItalic().run(),
      active: (e) => e.isActive('italic'),
    },
    {
      id: 'strike',
      label: 'Strikethrough',
      icon: Strikethrough,
      run: (e) => e.chain().focus().toggleStrike().run(),
      active: (e) => e.isActive('strike'),
    },
  ],
  [
    {
      id: 'h1',
      label: 'Large heading',
      icon: Heading1,
      run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
      active: (e) => e.isActive('heading', { level: 1 }),
    },
    {
      id: 'h2',
      label: 'Small heading',
      icon: Heading2,
      run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
      active: (e) => e.isActive('heading', { level: 2 }),
    },
  ],
  [
    {
      id: 'bullet',
      label: 'Bullet list',
      icon: List,
      run: (e) => e.chain().focus().toggleBulletList().run(),
      active: (e) => e.isActive('bulletList'),
    },
    {
      id: 'ordered',
      label: 'Numbered list',
      icon: ListOrdered,
      run: (e) => e.chain().focus().toggleOrderedList().run(),
      active: (e) => e.isActive('orderedList'),
    },
    {
      id: 'task',
      label: 'Checklist',
      icon: ListTodo,
      run: (e) => e.chain().focus().toggleTaskList().run(),
      active: (e) => e.isActive('taskList'),
    },
  ],
  [
    {
      id: 'code',
      label: 'Inline code',
      icon: Code,
      run: (e) => e.chain().focus().toggleCode().run(),
      active: (e) => e.isActive('code'),
    },
    {
      id: 'codeBlock',
      label: 'Code block',
      icon: CodeSquare,
      run: (e) => e.chain().focus().toggleCodeBlock().run(),
      active: (e) => e.isActive('codeBlock'),
    },
    {
      id: 'quote',
      label: 'Quote',
      icon: Quote,
      run: (e) => e.chain().focus().toggleBlockquote().run(),
      active: (e) => e.isActive('blockquote'),
    },
  ],
];

const UNDO: Tool[] = [
  {
    id: 'undo',
    label: 'Undo',
    icon: Undo2,
    run: (e) => e.chain().focus().undo().run(),
    enabled: (e) => e.can().undo(),
  },
  {
    id: 'redo',
    label: 'Redo',
    icon: Redo2,
    run: (e) => e.chain().focus().redo().run(),
    enabled: (e) => e.can().redo(),
  },
];

export function EditorToolbar({
  editor,
  onAddLink,
}: {
  editor: Editor | null;
  onAddLink: () => void;
}) {
  if (!editor) return null;

  const linkActive = editor.isActive('link');

  return (
    <div
      role="toolbar"
      aria-label="Text formatting"
      // Wraps rather than scrolls: a hidden formatting button is a button
      // nobody finds, and the panel is narrow enough for this to matter.
      className="flex flex-wrap items-center border-b border-line px-1.5 py-1"
    >
      {GROUPS.map((group, index) => (
        <div key={index} className="flex items-center">
          {index > 0 ? <Divider /> : null}
          {group.map((tool) => (
            <ToolButton key={tool.id} tool={tool} editor={editor} />
          ))}
        </div>
      ))}

      <Divider />
      <button
        type="button"
        className="fn-tool"
        aria-label={linkActive ? 'Remove link' : 'Add link'}
        aria-pressed={linkActive}
        title={linkActive ? 'Remove link' : 'Add link'}
        onClick={onAddLink}
      >
        {linkActive ? (
          <Link2Off size={15} aria-hidden="true" />
        ) : (
          <Link2 size={15} aria-hidden="true" />
        )}
      </button>

      <Divider />
      {UNDO.map((tool) => (
        <ToolButton key={tool.id} tool={tool} editor={editor} />
      ))}
    </div>
  );
}

function ToolButton({ tool, editor }: { tool: Tool; editor: Editor }) {
  const active = tool.active?.(editor) ?? false;
  const enabled = tool.enabled?.(editor) ?? true;
  const Icon = tool.icon;
  const hint = tool.shortcut
    ? `${tool.label} (${tool.shortcut.replace('Mod', navigator.platform.toLowerCase().includes('mac') ? '⌘' : 'Ctrl')})`
    : tool.label;

  return (
    <button
      type="button"
      className="fn-tool"
      aria-label={hint}
      aria-pressed={active}
      title={hint}
      disabled={!enabled}
      // The editor must not lose its selection when the button takes focus.
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => tool.run(editor)}
    >
      <Icon size={15} aria-hidden={true} />
    </button>
  );
}

const Divider = () => <span aria-hidden="true" className="mx-0.5 h-3.5 w-px bg-line" />;
