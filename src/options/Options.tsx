import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Download,
  FileText,
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
import { plural, t, tParts, type MessageKey } from '../lib/i18n';
import { markdownFilename, notesToMarkdown } from '../lib/markdown';
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
      setMessage(t('optSaved'));
    } else {
      setMessage(t('optSaveFailed', result.message));
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
        setMessage(t('launcherOffDone'));
      })();
      return;
    }

    chrome.permissions
      .request({ origins: [ALL_SITES] })
      .then(async (granted) => {
        setSiteAccess(granted);
        if (!granted) {
          setMessage(t('launcherDeclined'));
          return;
        }
        await saveSettings({ ...settings, showLauncher: true });
        await chrome.runtime.sendMessage({ type: 'launcher-changed' }).catch(() => undefined);
        setMessage(t('launcherOnDone'));
      })
      .catch(() => setMessage(t('launcherRefused')));
  }

  async function exportBackup() {
    const notes = await store.listNotes();
    download(serializeBackup(notes), 'application/json', backupFilename());
    setMessage(plural(notes.length, 'exportedOne', 'exportedOther'));
  }

  async function exportMarkdown() {
    const notes = (await store.listNotes()).filter(isActive);
    download(notesToMarkdown(notes), 'text/markdown', markdownFilename());
    setMessage(plural(notes.length, 'exportedMdOne', 'exportedMdOther'));
  }

  async function chooseFile(file: File) {
    const text = await file.text();
    const parsed = parseBackup(text);
    if (!parsed.ok) {
      setPending(null);
      setMessage(parsed.error ?? t('backupUnreadable'));
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
      setMessage(t('importFailed', result.message));
      return;
    }
    const { added, updated, unchanged, skipped, removed } = result.value;
    setMessage(
      [
        t('importAdded', added),
        t('importUpdated', updated),
        t('importCurrent', unchanged),
        removed > 0 ? t('importReplaced', removed) : null,
        skipped > 0 ? t('importSkipped', skipped) : null,
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
                {t('optTitle')}
              </h1>
              <p className="truncate text-xs text-muted">{t('optSubtitle')}</p>
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
            title={t('secAppearance')}
            description={t('secAppearanceDesc')}
          >
            <Appearance settings={settings} onChange={(next) => void saveSettings(next)} />
          </Card>

          <Card
            id="storage"
            title={t('secStorage')}
            description={t('secStorageDesc')}
          >
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="max-w-[68ch] space-y-2 text-sm text-muted">
                <p>
                  {tParts(
                    'storageP1',
                    <strong key="api" className="text-ink">
                      chrome.storage.local
                    </strong>,
                  )}
                </p>
                <p>
                  {tParts(
                    'storageP2',
                    <code key="path" className="rounded bg-soft px-1 py-0.5 font-mono text-xs break-all">
                      Local Extension Settings/{chrome.runtime.id}
                    </code>,
                  )}
                </p>
                <p className="rounded-lg bg-warning-bg px-3 py-2 text-warning">{t('storageWarn')}</p>
              </div>
              <div className="space-y-3">
                <dl className="grid grid-cols-3 gap-3">
                  <Stat label={t('statActive')} value={String(counts.active)} />
                  <Stat label={t('statTrash')} value={String(counts.trashed)} />
                  <Stat
                    label={t('statUsed')}
                    value={t('statUsedValue', formatBytes(usage.bytes), formatBytes(QUOTA_BYTES))}
                  />
                </dl>
                <div
                  className="h-1.5 w-full overflow-hidden rounded-full bg-soft"
                  role="img"
                  aria-label={t('storageBar', Math.round(usage.ratio * 100))}
                >
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${Math.min(100, Math.max(1, usage.ratio * 100))}%` }}
                  />
                </div>
                <p className="text-xs text-muted">
                  {t(
                    'storageShare',
                    usage.ratio > 0 && usage.ratio < 0.01
                      ? t('storageUnder1')
                      : `${Math.round(usage.ratio * 100)}%`,
                  )}
                </p>
              </div>
            </div>
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card
              id="backup"
              title={t('secBackup')}
              description={t('secBackupDesc')}
            >
              <p className="-mt-2 mb-4 text-sm text-muted">{t('backupMdNote')}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="fn-btn fn-btn-primary" onClick={() => void exportBackup()}>
                  <Download size={16} aria-hidden="true" />
                  {t('exportBackup')}
                </button>
                <button type="button" className="fn-btn" onClick={() => fileRef.current?.click()}>
                  <Upload size={16} aria-hidden="true" />
                  {t('chooseBackup')}
                </button>
                <button type="button" className="fn-btn" onClick={() => void exportMarkdown()}>
                  <FileText size={16} aria-hidden="true" />
                  {t('exportMarkdown')}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json,.json"
                  className="sr-only"
                  aria-label={t('backupFileLabel')}
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
                    {plural(pending.parsed.notes.length, 'pendingReadOne', 'pendingReadOther')}
                    {pending.parsed.skipped > 0 ? t('pendingSkipped', pending.parsed.skipped) : ''}
                    {pending.parsed.schemaVersion > 0
                      ? t('pendingSchema', pending.parsed.schemaVersion)
                      : ''}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="fn-btn fn-btn-primary"
                      onClick={() => void runImport('merge')}
                    >
                      {t('mergeInto')}
                    </button>
                    <button type="button" className="fn-btn" onClick={() => void runImport('replace')}>
                      {t('replaceAll')}
                    </button>
                    <button type="button" className="fn-btn" onClick={() => setPending(null)}>
                      {t('cancel')}
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    {plural(total, 'mergeExplainOne', 'mergeExplainOther')}
                  </p>
                </div>
              ) : null}
            </Card>

            <Card
              id="trash"
              title={t('secTrash')}
              description={t('secTrashDesc')}
            >
              <div className="flex flex-wrap items-center gap-3">
                <label htmlFor="retention" className="text-sm">
                  {t('keepFor')}
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
                      {t('daysOption', days)}
                    </option>
                  ))}
                </select>
              </div>
              <p className="mt-3 text-xs text-muted">
                {t('trashAfter')}
              </p>
            </Card>
          </div>

          <Card
            id="quick-open"
            title={t('secQuickOpen')}
            description={t('secQuickOpenDesc')}
          >
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="max-w-[68ch] space-y-2 text-sm text-muted">
                <p>{t('quickOpenP1')}</p>
                <p>
                  <strong className="text-ink">{t('quickOpenStrong')}</strong> {t('quickOpenP2')}
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
                  <span className="font-medium">{t('quickOpenToggle')}</span>
                  <span className="mt-0.5 block text-xs text-muted">{t('quickOpenToggleHint')}</span>
                  {settings.showLauncher && !siteAccess ? (
                    <span className="mt-1 block text-xs text-warning">{t('quickOpenRevoked')}</span>
                  ) : null}
                </span>
              </label>
            </div>
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card id="keyboard" title={t('secKeyboard')} description={t('secKeyboardDesc')}>
              <dl className="divide-y divide-line text-sm">
                {SHORTCUTS.map(([keys, what]) => (
                  <div key={keys} className="flex items-center justify-between gap-4 py-2">
                    <dt className="text-muted">{t(what)}</dt>
                    <dd>
                      <kbd className="rounded-md border border-line bg-bg px-2 py-0.5 font-mono text-xs text-ink">
                        {keys}
                      </kbd>
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 text-xs text-muted">
                {t('keyConflict')}
              </p>
              <button
                type="button"
                className="fn-btn mt-3"
                onClick={() => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })}
              >
                <Keyboard size={16} aria-hidden="true" />
                {t('keyOpenSettings')}
              </button>
            </Card>

            <Card id="privacy" title={t('secPrivacy')} description={t('secPrivacyDesc')}>
              <ul className="space-y-2 text-sm text-muted">
                {PRIVACY.map((line) => (
                  <li key={line} className="flex gap-2">
                    <Check size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-accent" />
                    <span>{t(line)}</span>
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

/**
 * Save a string as a file. A blob URL keeps it entirely local; nothing is
 * uploaded anywhere.
 */
function download(contents: string, type: string, filename: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const SECTIONS: ReadonlyArray<{ id: string; label: MessageKey; icon: typeof Palette }> = [
  { id: 'appearance', label: 'secAppearance', icon: Palette },
  { id: 'storage', label: 'secStorageNav', icon: HardDrive },
  { id: 'backup', label: 'secBackup', icon: Download },
  { id: 'trash', label: 'secTrash', icon: Trash2 },
  { id: 'quick-open', label: 'secQuickOpen', icon: MousePointerClick },
  { id: 'keyboard', label: 'secKeyboard', icon: Keyboard },
  { id: 'privacy', label: 'secPrivacy', icon: ShieldCheck },
];

const SHORTCUTS: [string, MessageKey][] = [
  ['Alt+Shift+N', 'keyOpen'],
  ['Ctrl/Cmd+K', 'keySearch'],
  ['Ctrl/Cmd+Enter', 'keyCommit'],
  ['Escape', 'keyEscape'],
];

const PRIVACY: MessageKey[] = ['privacy1', 'privacy2', 'privacy3', 'privacy4', 'privacy5'];

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
    <nav aria-label={t('settingsSections')} className="lg:sticky lg:top-24 lg:self-start">
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
              {t(label)}
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
