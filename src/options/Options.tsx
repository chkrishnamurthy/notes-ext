import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Download,
  HardDrive,
  Keyboard,
  MousePointerClick,
  NotebookPen,
  Palette,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';

import {
  backupFilename,
  importBackup,
  parseBackup,
  planMerge,
  serializeBackup,
  type ImportMode,
  type ParsedBackup,
} from '../lib/backup';
import { isActive, isTrashed } from '../lib/notes';
import { DEFAULT_SETTINGS, type Settings } from '../lib/schema';
import { chromeLocalArea, NoteStore, QUOTA_BYTES } from '../lib/storage';
import { applyTheme } from '../lib/theme';
import { formatBytes } from '../lib/time';
import { Appearance } from './Appearance';

const store = new NoteStore(chromeLocalArea());

const RETENTION_CHOICES = [7, 14, 30, 90];

/** The one origin pattern the quick-open button needs, and nothing wider. */
const ALL_SITES = '<all_urls>';

export function Options() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [counts, setCounts] = useState({ active: 0, trashed: 0 });
  const [usage, setUsage] = useState({ bytes: 0, ratio: 0 });
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<{ parsed: ParsedBackup; filename: string } | null>(null);
  const [siteAccess, setSiteAccess] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const [notes, loadedSettings, bytes, granted] = await Promise.all([
      store.listNotes(),
      store.getSettings(),
      store.usage(),
      chrome.permissions.contains({ origins: [ALL_SITES] }).catch(() => false),
    ]);
    setSiteAccess(granted);
    setCounts({
      active: notes.filter(isActive).length,
      trashed: notes.filter(isTrashed).length,
    });
    setSettings(loadedSettings);
    applyTheme(loadedSettings);
    setUsage({ bytes: bytes.bytes, ratio: bytes.ratio });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function saveSettings(next: Settings) {
    const result = await store.setSettings(next);
    if (result.ok) {
      setSettings(result.value);
      applyTheme(result.value);
      setMessage('Settings saved on this device.');
    } else {
      setMessage(`Could not save settings — ${result.message}`);
    }
  }

  /**
   * Turn the quick-open button on or off.
   *
   * `permissions.request` has to be reached before the click's user gesture is
   * spent, so it is the first thing this does — an `await` in front of it
   * would make Chrome reject the prompt outright.
   */
  function toggleLauncher(next: boolean) {
    if (!next) {
      void (async () => {
        await saveSettings({ ...settings, showLauncher: false });
        await chrome.runtime.sendMessage({ type: 'launcher-changed' }).catch(() => undefined);
        // Hand the access back rather than keeping a permission that is no
        // longer being used for anything.
        await chrome.permissions.remove({ origins: [ALL_SITES] }).catch(() => undefined);
        setSiteAccess(false);
        setMessage('Quick-open button turned off, and site access given back to Chrome.');
      })();
      return;
    }

    chrome.permissions
      .request({ origins: [ALL_SITES] })
      .then(async (granted) => {
        setSiteAccess(granted);
        if (!granted) {
          setMessage(
            'Site access was declined, so the button stays off. The toolbar icon and Alt+Shift+N still work.',
          );
          return;
        }
        await saveSettings({ ...settings, showLauncher: true });
        await chrome.runtime.sendMessage({ type: 'launcher-changed' }).catch(() => undefined);
        setMessage('Quick-open button turned on. It appears at the bottom-right of every page.');
      })
      .catch(() => setMessage('Chrome refused the permission prompt. Nothing was changed.'));
  }

  async function exportBackup() {
    const notes = await store.listNotes();
    const json = serializeBackup(notes);
    // A blob URL keeps the file entirely local; nothing is uploaded anywhere.
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = backupFilename();
    link.click();
    URL.revokeObjectURL(url);
    setMessage(
      `Exported ${notes.length} ${notes.length === 1 ? 'note' : 'notes'}, including Trash.`,
    );
  }

  async function chooseFile(file: File) {
    const text = await file.text();
    const parsed = parseBackup(text);
    if (!parsed.ok) {
      setPending(null);
      setMessage(parsed.error ?? 'That backup could not be read.');
      return;
    }
    // Nothing is written until the summary below is confirmed.
    setPending({ parsed, filename: file.name });
    setMessage('');
  }

  async function runImport(mode: ImportMode) {
    if (!pending) return;
    const result = await importBackup(store, pending.parsed, mode);
    setPending(null);
    if (fileRef.current) fileRef.current.value = '';
    if (!result.ok) {
      setMessage(`Import failed — ${result.message}. Nothing was changed.`);
      return;
    }
    const { added, updated, unchanged, skipped, removed } = result.value;
    setMessage(
      [
        `Imported: ${added} added`,
        `${updated} updated`,
        `${unchanged} already current`,
        removed > 0 ? `${removed} replaced` : null,
        skipped > 0 ? `${skipped} unreadable and skipped` : null,
      ]
        .filter(Boolean)
        .join(' · '),
    );
    await refresh();
  }

  const mergePreview = useMemo(() => {
    if (!pending) return null;
    return planMerge([], pending.parsed.notes);
  }, [pending]);

  const total = counts.active + counts.trashed;

  return (
    <div className="min-h-screen bg-bg text-ink">
      {/* The header stays put, so the result of whatever was just changed is
          always on screen — not announced at the foot of a long page. */}
      <header className="sticky top-0 z-10 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex w-[90%] items-center justify-between gap-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex shrink-0 rounded-lg border border-accent p-1.5 text-accent">
              <NotebookPen size={18} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold leading-tight tracking-tight">
                For Now settings
              </h1>
              <p className="truncate text-xs text-muted">
                Appearance, backup and privacy · everything stays on this device
              </p>
            </div>
          </div>
          <div
            role="status"
            aria-live="polite"
            className={`min-w-0 max-w-[50%] truncate rounded-full px-3 py-1 text-xs ${
              message ? 'bg-soft text-accent' : ''
            }`}
            title={message}
          >
            {message}
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-[90%] gap-8 py-8 lg:grid-cols-[200px_minmax(0,1fr)]">
        <SideNav />

        <main className="min-w-0 space-y-6">
          <Card
            id="appearance"
            title="Appearance"
            description="Colours, mode and note text. Changes apply at once to the side panel, the in-page panel and this page."
          >
            <Appearance settings={settings} onChange={(next) => void saveSettings(next)} />
          </Card>

          <Card
            id="storage"
            title="Where your notes live"
            description="What is stored, how much room it takes, and where it sits on disk."
          >
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="max-w-[68ch] space-y-2 text-sm text-muted">
                <p>
                  Notes are stored on this device by <strong className="text-ink">chrome.storage.local</strong>.
                  There is no account and nothing is uploaded. This is local storage on your computer, not
                  an encrypted vault — anyone who can use your Chrome profile can read these notes.
                </p>
                <p>
                  On disk that is your Chrome profile folder, under{' '}
                  <code className="rounded bg-soft px-1 py-0.5 font-mono text-xs break-all">
                    Local Extension Settings/{chrome.runtime.id}
                  </code>
                  , as a LevelDB database. The text is not encrypted.
                </p>
                <p className="rounded-lg bg-warning-bg px-3 py-2 text-warning">
                  Removing the extension deletes its local notes. Export a backup before you uninstall,
                  reset Chrome, or move to another computer.
                </p>
              </div>
              <div className="space-y-3">
                <dl className="grid grid-cols-3 gap-3">
                  <Stat label="Active notes" value={String(counts.active)} />
                  <Stat label="In Trash" value={String(counts.trashed)} />
                  <Stat
                    label="Storage used"
                    value={`${formatBytes(usage.bytes)} of ${formatBytes(QUOTA_BYTES)}`}
                  />
                </dl>
                <div
                  className="h-1.5 w-full overflow-hidden rounded-full bg-soft"
                  role="img"
                  aria-label={`Storage ${Math.round(usage.ratio * 100)} percent used`}
                >
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${Math.min(100, Math.max(1, usage.ratio * 100))}%` }}
                  />
                </div>
                <p className="text-xs text-muted">
                  {usage.ratio > 0 && usage.ratio < 0.01
                    ? 'Under 1%'
                    : `${Math.round(usage.ratio * 100)}%`}{' '}
                  of the space Chrome gives this extension.
                </p>
              </div>
            </div>
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card
              id="backup"
              title="Backup"
              description="A plain JSON file with every note, Trash included. Import it to restore, or to move to another computer."
            >
              <div className="flex flex-wrap gap-2">
                <button type="button" className="fn-btn fn-btn-primary" onClick={() => void exportBackup()}>
                  <Download size={16} aria-hidden="true" />
                  Export backup
                </button>
                <button type="button" className="fn-btn" onClick={() => fileRef.current?.click()}>
                  <Upload size={16} aria-hidden="true" />
                  Choose a backup file…
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json,.json"
                  className="sr-only"
                  aria-label="Backup file to import"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void chooseFile(file);
                  }}
                />
              </div>

              {pending && mergePreview ? (
                <div className="mt-4 rounded-lg border border-line bg-bg p-4">
                  <p className="font-medium">{pending.filename}</p>
                  <p className="mt-1 text-sm text-muted">
                    {pending.parsed.notes.length}{' '}
                    {pending.parsed.notes.length === 1 ? 'note' : 'notes'} read
                    {pending.parsed.skipped > 0
                      ? ` · ${pending.parsed.skipped} unreadable and skipped`
                      : ''}
                    {pending.parsed.schemaVersion > 0
                      ? ` · schema v${pending.parsed.schemaVersion}`
                      : ''}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="fn-btn fn-btn-primary"
                      onClick={() => void runImport('merge')}
                    >
                      Merge into my notes
                    </button>
                    <button type="button" className="fn-btn" onClick={() => void runImport('replace')}>
                      Replace everything
                    </button>
                    <button type="button" className="fn-btn" onClick={() => setPending(null)}>
                      Cancel
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    Merge keeps whichever copy of a note was edited more recently. Replace deletes the{' '}
                    {total} note{total === 1 ? '' : 's'} on this device first.
                  </p>
                </div>
              ) : null}
            </Card>

            <Card
              id="trash"
              title="Trash"
              description="Clearing a note moves it to Trash. Pinned notes are never included in bulk cleanup."
            >
              <div className="flex flex-wrap items-center gap-3">
                <label htmlFor="retention" className="text-sm">
                  Keep cleared notes for
                </label>
                <select
                  id="retention"
                  className="fn-btn"
                  value={settings.trashRetentionDays}
                  onChange={(event) =>
                    void saveSettings({
                      ...settings,
                      trashRetentionDays: Number(event.target.value),
                    })
                  }
                >
                  {RETENTION_CHOICES.map((days) => (
                    <option key={days} value={days}>
                      {days} days
                    </option>
                  ))}
                </select>
              </div>
              <p className="mt-3 text-xs text-muted">
                After that, notes in Trash are removed permanently.
              </p>
            </Card>
          </div>

          <Card
            id="quick-open"
            title="Quick-open button"
            description="A small button at the bottom-right of every page, so the panel is one click away."
          >
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="max-w-[68ch] space-y-2 text-sm text-muted">
                <p>
                  It is off by default for a reason: to draw a button on a page, the extension needs
                  permission to run on that page, and the only way to have it everywhere is access to
                  every site. Turning this on asks Chrome for that access. Turning it off hands the
                  access straight back.
                </p>
                <p>
                  <strong className="text-ink">This changes nothing about what is collected.</strong> The
                  button reads no page content and sends nothing anywhere — it draws an icon and listens
                  for a click.
                </p>
              </div>
              <label className="flex cursor-pointer items-start gap-3 self-start rounded-lg border border-line bg-bg p-4">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 cursor-pointer accent-[var(--color-accent)]"
                  checked={settings.showLauncher && siteAccess}
                  onChange={(event) => toggleLauncher(event.target.checked)}
                />
                <span className="text-sm text-ink">
                  <span className="font-medium">Show the quick-open button on pages</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    The panel genies out of it, and it steps aside while the panel is open.
                  </span>
                  {settings.showLauncher && !siteAccess ? (
                    <span className="mt-1 block text-xs text-warning">
                      Turned on, but site access has been revoked in Chrome, so the button is not
                      showing. Tick this again to restore it.
                    </span>
                  ) : null}
                </span>
              </label>
            </div>
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card id="keyboard" title="Keyboard" description="Shortcuts that work in the panel.">
              <dl className="divide-y divide-line text-sm">
                {SHORTCUTS.map(([keys, what]) => (
                  <div key={keys} className="flex items-center justify-between gap-4 py-2">
                    <dt className="text-muted">{what}</dt>
                    <dd>
                      <kbd className="rounded-md border border-line bg-bg px-2 py-0.5 font-mono text-xs text-ink">
                        {keys}
                      </kbd>
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 text-xs text-muted">
                Chrome may already use Alt+Shift+N. Check and change it in Chrome's shortcut settings.
              </p>
              <button
                type="button"
                className="fn-btn mt-3"
                onClick={() => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })}
              >
                <Keyboard size={16} aria-hidden="true" />
                Open Chrome's shortcut settings
              </button>
            </Card>

            <Card id="privacy" title="Privacy" description="What the extension does, and does not, do.">
              <ul className="space-y-2 text-sm text-muted">
                {PRIVACY.map((line) => (
                  <li key={line} className="flex gap-2">
                    <Check size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-accent" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}

const SECTIONS = [
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'storage', label: 'Storage', icon: HardDrive },
  { id: 'backup', label: 'Backup', icon: Download },
  { id: 'trash', label: 'Trash', icon: Trash2 },
  { id: 'quick-open', label: 'Quick-open button', icon: MousePointerClick },
  { id: 'keyboard', label: 'Keyboard', icon: Keyboard },
  { id: 'privacy', label: 'Privacy', icon: ShieldCheck },
] as const;

const SHORTCUTS: [string, string][] = [
  ['Alt+Shift+N', 'Open the panel'],
  ['Ctrl/Cmd+K', 'Search notes'],
  ['Ctrl/Cmd+Enter', 'Add a note or save an edit'],
  ['Escape', 'Step back out of an edit, a search, or the panel'],
];

const PRIVACY = [
  'No account, no server, no analytics, and no network requests.',
  'Only what you explicitly save is captured — never a page you merely visit.',
  'Link previews and favicons are not fetched, so saving a link reveals nothing.',
  'Formatted notes are stripped to a small allowlist before they are saved and again before they are shown. Scripts, styles and embeds never survive, and code blocks are shown as text, never run.',
  'The extension is disabled in Incognito windows.',
];

/**
 * The section menu. It follows the scroll, so it always says where you are;
 * on narrow windows it becomes a row of links above the cards.
 */
function SideNav() {
  const [current, setCurrent] = useState<string>(SECTIONS[0].id);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setCurrent(visible[0].target.id);
      },
      // The band just under the sticky header counts as "here".
      { rootMargin: '-80px 0px -60% 0px' },
    );
    for (const { id } of SECTIONS) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <nav aria-label="Settings sections" className="lg:sticky lg:top-24 lg:self-start">
      <ul className="flex flex-wrap gap-1 lg:flex-col">
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <li key={id}>
            <a
              href={`#${id}`}
              aria-current={current === id ? 'true' : undefined}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm no-underline ${
                current === id
                  ? 'bg-paper font-medium text-accent shadow-sm ring-1 ring-line'
                  : 'text-muted hover:bg-soft hover:text-ink'
              }`}
            >
              <Icon size={16} aria-hidden="true" />
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Card({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-24 rounded-xl border border-line bg-paper p-6 shadow-[0_1px_2px_var(--fn-shadow)]"
    >
      <header className="mb-5">
        <h2 id={`${id}-title`} className="text-lg font-semibold tracking-tight">
          {title}
        </h2>
        {description ? <p className="mt-1 max-w-[80ch] text-sm text-muted">{description}</p> : null}
      </header>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-bg p-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-base font-medium text-ink">{value}</dd>
    </div>
  );
}
