import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Keyboard, NotebookPen, Upload } from 'lucide-react';

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
import { DEFAULT_SETTINGS, type Settings, type ThemePreference } from '../lib/schema';
import { chromeLocalArea, NoteStore, QUOTA_BYTES } from '../lib/storage';
import { applyTheme } from '../lib/theme';
import { formatBytes } from '../lib/time';

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
    applyTheme(loadedSettings.theme);
    setUsage({ bytes: bytes.bytes, ratio: bytes.ratio });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function saveSettings(next: Settings) {
    const result = await store.setSettings(next);
    if (result.ok) {
      setSettings(result.value);
      applyTheme(result.value.theme);
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

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
        <span className="inline-flex rounded-md border border-accent p-1.5 text-accent">
          <NotebookPen size={18} aria-hidden="true" />
        </span>
        For Now — settings and backup
      </h1>

      <Section title="Where your notes live">
        <p>
          Notes are stored on this device by <strong>chrome.storage.local</strong>. There is no
          account and nothing is uploaded. This is local storage on your computer, not an
          encrypted vault — anyone who can use your Chrome profile can read these notes.
        </p>
        <p>
          On disk that is your Chrome profile folder, under{' '}
          <code className="rounded bg-soft px-1 py-0.5 font-mono text-xs">
            Local Extension Settings/{chrome.runtime.id}
          </code>
          , as a LevelDB database. The text is not encrypted.
        </p>
        <p className="text-warning">
          Removing the extension deletes its local notes. Export a backup before you uninstall,
          reset Chrome, or move to another computer.
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Active notes" value={String(counts.active)} />
          <Stat label="In Trash" value={String(counts.trashed)} />
          <Stat
            label="Storage used"
            value={`${formatBytes(usage.bytes)} of ${formatBytes(QUOTA_BYTES)}`}
          />
        </dl>
        <div
          className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-soft"
          role="img"
          aria-label={`Storage ${Math.round(usage.ratio * 100)} percent used`}
        >
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${Math.min(100, Math.max(1, usage.ratio * 100))}%` }}
          />
        </div>
      </Section>

      <Section title="Backup">
        <p>
          An export is a plain JSON file containing every note, including Trash. Import it here to
          restore, or to move notes to another computer.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="fn-btn" onClick={() => void exportBackup()}>
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
              <button
                type="button"
                className="fn-btn"
                onClick={() => void runImport('replace')}
              >
                Replace everything
              </button>
              <button type="button" className="fn-btn" onClick={() => setPending(null)}>
                Cancel
              </button>
            </div>
            <p className="mt-2 text-xs text-muted">
              Merge keeps whichever copy of a note was edited more recently. Replace deletes the{' '}
              {counts.active + counts.trashed} note
              {counts.active + counts.trashed === 1 ? '' : 's'} on this device first.
            </p>
          </div>
        ) : null}
      </Section>

      <Section title="Trash">
        <p>
          Clearing a note moves it to Trash. Notes there stay recoverable for the window below,
          then they are removed permanently. Pinned notes are never included in bulk cleanup.
        </p>
        <div className="mt-3 flex items-center gap-2">
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
      </Section>

      <Section title="Quick-open button">
        <p>
          A small button at the bottom-right of every page, so the panel is one
          click away without hunting for the toolbar icon. The panel genies out of
          it, and it steps aside while the panel is open.
        </p>
        <p>
          It is off by default for a reason: to draw a button on a page, the
          extension needs permission to run on that page, and the only way to have
          it everywhere is access to every site. Turning this on asks Chrome for
          that access. Turning it off hands the access straight back.
        </p>
        <p>
          <strong>This changes nothing about what is collected.</strong> The button
          reads no page content and sends nothing anywhere — it draws an icon and
          listens for a click. Notes stay on this device either way.
        </p>
        <label className="mt-3 flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            className="mt-0.5 size-4 cursor-pointer accent-[var(--color-accent)]"
            checked={settings.showLauncher && siteAccess}
            onChange={(event) => toggleLauncher(event.target.checked)}
          />
          <span className="text-sm text-ink">
            Show the quick-open button on pages
            {settings.showLauncher && !siteAccess ? (
              <span className="mt-0.5 block text-xs text-warning">
                Turned on, but site access has been revoked in Chrome, so the button is
                not showing. Tick this again to restore it.
              </span>
            ) : null}
          </span>
        </label>
      </Section>

      <Section title="Appearance">
        <div className="flex items-center gap-2">
          <label htmlFor="theme" className="text-sm">
            Theme
          </label>
          <select
            id="theme"
            className="fn-btn"
            value={settings.theme}
            onChange={(event) =>
              void saveSettings({
                ...settings,
                theme: event.target.value as ThemePreference,
              })
            }
          >
            <option value="system">Match the system</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
      </Section>

      <Section title="Keyboard">
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <strong>Alt+Shift+N</strong> opens the panel. Chrome may already use that combination,
            so check and change it below.
          </li>
          <li>
            <strong>Ctrl/Cmd+K</strong> focuses search inside the panel.
          </li>
          <li>
            <strong>Ctrl/Cmd+Enter</strong> adds a note or saves an edit.
          </li>
          <li>
            <strong>Escape</strong> steps back out of an edit, a search, or the panel.
          </li>
        </ul>
        <button
          type="button"
          className="fn-btn mt-3"
          onClick={() => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })}
        >
          <Keyboard size={16} aria-hidden="true" />
          Open Chrome's shortcut settings
        </button>
      </Section>

      <Section title="Privacy">
        <ul className="ml-5 list-disc space-y-1">
          <li>No account, no server, no analytics, and no network requests.</li>
          <li>Only what you explicitly save is captured — never a page you merely visit.</li>
          <li>Link previews and favicons are not fetched, so saving a link reveals nothing.</li>
          <li>
            Formatted notes are stored as HTML, stripped to a small allowlist before they are
            saved and again before they are shown. Scripts, styles and embeds never survive, and
            code blocks are displayed as text, never run.
          </li>
          <li>The extension is disabled in Incognito windows.</li>
        </ul>
      </Section>

      <div role="status" aria-live="polite" className="mt-6 min-h-6 text-sm text-accent">
        {message}
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 border-t border-line pt-6">
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      <div className="space-y-2 text-sm text-muted">{children}</div>
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
