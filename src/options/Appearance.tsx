import { Bold, Check, Italic, Link2, List, Maximize2, NotebookPen, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import { ACCENT_PRESETS, PALETTES, type Palette, type PaletteId } from '../lib/palettes';
import type { EditorFont, Settings, TextSize, ThemePreference } from '../lib/schema';
import {
  EDITOR_FONTS,
  TEXT_SIZES,
  applyTheme,
  resolveMode,
  resolveTokens,
  themeVariables,
  type Mode,
} from '../lib/theme';

/** How long the colour picker must rest before its value is saved. */
const ACCENT_SAVE_DELAY_MS = 300;

/** What the custom picker starts on before anything has been chosen. */
const CUSTOM_START = '#e0457b';

const MODES: { id: ThemePreference; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

/**
 * The Appearance section of the options page: mode, a palette for each mode,
 * an accent colour, and the note typeface and size, with a live preview.
 *
 * Every choice saves at once and repaints any open panel through
 * `storage.onChanged`. The colour picker is the exception: it paints this page
 * live while it is dragged and saves once it settles, so a drag across the
 * spectrum is one write rather than hundreds.
 */
export function Appearance({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange: (next: Settings) => void;
}) {
  const [draftAccent, setDraftAccent] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<Mode | null>(null);
  const [systemDark, setSystemDark] = useState(() => resolveMode('system') === 'dark');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The appearance as it should look right now, including an unsaved drag.
  const live: Settings = draftAccent ? { ...settings, accent: draftAccent } : settings;

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemDark(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  const effective: Mode = resolveMode(settings.theme, systemDark);
  // With the mode pinned only one palette can ever show, so preview that one.
  const shown: Mode = settings.theme === 'system' ? (previewMode ?? effective) : effective;

  function update(patch: Partial<Settings>) {
    onChange({ ...settings, ...patch });
  }

  function pickAccent(value: string | null) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setDraftAccent(null);
    update({ accent: value });
  }

  function dragAccent(value: string) {
    setDraftAccent(value);
    applyTheme({ ...settings, accent: value });
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setDraftAccent(null);
      update({ accent: value });
    }, ACCENT_SAVE_DELAY_MS);
  }

  const isPreset = ACCENT_PRESETS.some((p) => p.value === live.accent);
  const custom = live.accent && !isPreset ? live.accent : null;
  const lightResolved = resolveTokens(live, 'light');
  const darkResolved = resolveTokens(live, 'dark');

  const accentNote = (() => {
    if (!live.accent) return 'Each palette uses its own accent.';
    const adjusted = lightResolved.accentAdjusted || darkResolved.accentAdjusted;
    return adjusted
      ? 'Adjusted slightly where needed so buttons and links stay readable in both light and dark.'
      : 'Readable as picked in both light and dark.';
  })();

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-5">
        <Field label="Mode" hint={settings.theme === 'system' ? `Following your system, currently ${effective}` : `Always ${effective}`}>
          <Segmented
            name="Mode"
            value={settings.theme}
            options={MODES}
            onChange={(theme) => {
              setPreviewMode(null);
              update({ theme });
            }}
          />
        </Field>

        {settings.theme !== 'dark' ? (
          <Field label="Light theme" hint="Used in light mode">
            <PaletteGrid
              mode="light"
              value={settings.lightPalette}
              settings={live}
              onChange={(lightPalette) => {
                setPreviewMode('light');
                update({ lightPalette });
              }}
            />
          </Field>
        ) : null}

        {settings.theme !== 'light' ? (
          <Field label="Dark theme" hint="Used in dark mode">
            <PaletteGrid
              mode="dark"
              value={settings.darkPalette}
              settings={live}
              onChange={(darkPalette) => {
                setPreviewMode('dark');
                update({ darkPalette });
              }}
            />
          </Field>
        ) : null}

        <Field label="Accent colour" hint="Buttons, links, checkboxes and highlights">
          <div role="radiogroup" aria-label="Accent colour" className="flex flex-wrap items-center gap-2">
            <Swatch
              label="Palette default"
              checked={!live.accent}
              style={{
                background: `conic-gradient(${lightResolved.tokens.accent} 0 50%, ${darkResolved.tokens.accent} 0 100%)`,
              }}
              onClick={() => pickAccent(null)}
            />
            {ACCENT_PRESETS.map((preset) => (
              <Swatch
                key={preset.value}
                label={preset.name}
                checked={live.accent === preset.value}
                style={{ background: preset.value }}
                onClick={() => pickAccent(preset.value)}
              />
            ))}
            <label
              htmlFor="accent-custom"
              className={`ml-1 inline-flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm ${
                custom ? 'text-ink' : 'text-muted'
              }`}
            >
              <input
                id="accent-custom"
                type="color"
                className="h-7 w-9 cursor-pointer rounded border border-line bg-transparent p-0"
                value={custom ?? CUSTOM_START}
                onChange={(event) => dragAccent(event.target.value)}
              />
              Custom{custom ? <span className="font-mono text-xs">{custom}</span> : null}
            </label>
          </div>
          <p className="text-xs text-muted" aria-live="polite">
            {accentNote}
          </p>
        </Field>

        <Field label="Note font" hint="The editor and your saved notes">
          <Segmented
            name="Note font"
            value={settings.editorFont}
            options={(Object.keys(EDITOR_FONTS) as EditorFont[]).map((id) => ({
              id,
              label: EDITOR_FONTS[id].label,
              style: { fontFamily: EDITOR_FONTS[id].stack },
            }))}
            onChange={(editorFont) => update({ editorFont })}
          />
        </Field>

        <Field label="Text size" hint={`${TEXT_SIZES[settings.textSize].px}px`}>
          <Segmented
            name="Text size"
            value={settings.textSize}
            options={(Object.keys(TEXT_SIZES) as TextSize[]).map((id) => ({
              id,
              label: TEXT_SIZES[id].label,
            }))}
            onChange={(textSize) => update({ textSize })}
          />
        </Field>

        <button
          type="button"
          className="fn-btn"
          onClick={() => {
            if (saveTimer.current) clearTimeout(saveTimer.current);
            setDraftAccent(null);
            setPreviewMode(null);
            update({
              theme: 'system',
              lightPalette: 'sage',
              darkPalette: 'sage',
              accent: null,
              editorFont: 'sans',
              textSize: 'medium',
            });
          }}
        >
          Reset appearance
        </button>
      </div>

      <div className="min-w-0 space-y-2 lg:sticky lg:top-24 lg:self-start">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-ink">Preview</span>
          {settings.theme === 'system' ? (
            <Segmented
              name="Preview mode"
              small
              value={shown}
              options={[
                { id: 'light', label: 'Light' },
                { id: 'dark', label: 'Dark' },
              ]}
              onChange={setPreviewMode}
            />
          ) : null}
        </div>
        <PanelPreview settings={live} mode={shown} />
        <p className="text-xs text-muted">
          {paletteName(shown === 'dark' ? settings.darkPalette : settings.lightPalette)} · {shown}
        </p>
      </div>
    </div>
  );
}

function paletteName(id: PaletteId): string {
  return PALETTES.find((p) => p.id === id)?.name ?? id;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-sm font-medium text-ink">{label}</span>
        {hint ? <span className="text-xs text-muted">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

function Segmented<T extends string>({
  name,
  value,
  options,
  onChange,
  small = false,
}: {
  name: string;
  value: T;
  options: { id: T; label: string; style?: CSSProperties }[];
  onChange: (next: T) => void;
  small?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={name}
      className="inline-flex max-w-full gap-0.5 rounded-lg border border-line bg-soft p-0.5"
    >
      {options.map((option) => {
        const checked = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={checked}
            data-value={option.id}
            style={option.style}
            className={`rounded-md border-0 ${small ? 'px-2 py-0.5 text-xs' : 'px-3.5 py-1.5 text-sm'} ${
              checked ? 'bg-paper font-medium text-ink shadow-sm' : 'bg-transparent text-muted hover:text-ink'
            }`}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function PaletteGrid({
  mode,
  value,
  settings,
  onChange,
}: {
  mode: Mode;
  value: PaletteId;
  settings: Settings;
  onChange: (next: PaletteId) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={mode === 'light' ? 'Light theme' : 'Dark theme'}
      className="grid grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-2.5"
    >
      {PALETTES.map((palette) => (
        <PaletteCard
          key={palette.id}
          palette={palette}
          mode={mode}
          settings={settings}
          checked={palette.id === value}
          onClick={() => onChange(palette.id)}
        />
      ))}
    </div>
  );
}

function PaletteCard({
  palette,
  mode,
  settings,
  checked,
  onClick,
}: {
  palette: Palette;
  mode: Mode;
  settings: Settings;
  checked: boolean;
  onClick: () => void;
}) {
  // The thumbnail shows the palette as it would look with the chosen accent.
  const t = resolveTokens(
    { ...settings, lightPalette: palette.id, darkPalette: palette.id },
    mode,
  ).tokens;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      data-palette={palette.id}
      title={palette.description}
      onClick={onClick}
      className={`grid gap-1.5 rounded-lg border bg-paper p-1.5 text-left ${
        checked ? 'border-accent ring-1 ring-accent' : 'border-line hover:border-muted'
      }`}
    >
      <span
        aria-hidden="true"
        className="grid h-16 grid-rows-[12px_1fr_14px] overflow-hidden rounded-md border"
        style={{ background: t.paper, borderColor: t.line }}
      >
        <span className="flex items-center px-1.5" style={{ borderBottom: `1px solid ${t.line}` }}>
          <span className="h-[3px] w-4 rounded-sm" style={{ background: t.ink }} />
        </span>
        <span className="grid content-start gap-1 px-1.5 py-1">
          <span className="h-[3px] w-4/5 rounded-sm" style={{ background: t.ink }} />
          <span className="h-[3px] w-3/5 rounded-sm" style={{ background: t.muted }} />
          <span className="h-[3px] w-2/5 rounded-sm" style={{ background: t.accent }} />
        </span>
        <span
          className="flex items-center justify-end px-1.5"
          style={{ background: t.bg, borderTop: `1px solid ${t.line}` }}
        >
          <span className="h-[7px] w-6 rounded-sm" style={{ background: t.accent }} />
        </span>
      </span>
      <span className="flex items-center justify-between px-0.5 text-xs font-medium text-ink">
        {palette.name}
        {checked ? <Check size={13} aria-hidden="true" className="text-accent" /> : null}
      </span>
    </button>
  );
}

function Swatch({
  label,
  checked,
  style,
  onClick,
}: {
  label: string;
  checked: boolean;
  style: CSSProperties;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-label={label}
      title={label}
      onClick={onClick}
      style={style}
      className={`size-7 rounded-full border-2 border-paper ${
        checked ? 'ring-2 ring-ink' : 'ring-1 ring-line'
      }`}
    />
  );
}

/**
 * A still of the notes panel, painted with the chosen appearance.
 *
 * It uses the panel's real classes. The theme's custom properties are set on
 * the wrapper, so everything inside resolves against them instead of against
 * this page's own theme — which is how the preview can show dark while the
 * page itself is light.
 */
function PanelPreview({ settings, mode }: { settings: Settings; mode: Mode }) {
  const vars = themeVariables(settings, mode) as CSSProperties;
  return (
    <div
      inert
      aria-hidden="true"
      data-preview-mode={mode}
      style={{ ...vars, colorScheme: mode, fontSize: 'var(--fn-text)' }}
      className="overflow-hidden rounded-xl border border-line bg-paper text-ink shadow-md"
    >
      <div className="flex items-center justify-between px-2.5 py-1.5">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold">
          <NotebookPen size={13} className="text-accent" />
          For Now
        </span>
      </div>
      <div className="flex items-center gap-1 border-y border-line px-2 py-1 text-ink">
        {[Bold, Italic, List, Link2, Undo2].map((Icon, i) => (
          <span key={i} className="inline-flex size-6 items-center justify-center">
            <Icon size={14} />
          </span>
        ))}
      </div>
      <div className="fn-prose px-3 py-2.5">
        <h2>Tuesday standup</h2>
        <p>
          Ship the <mark>overlay fix</mark>, see <a>the notes</a>.
        </p>
        {/* Drawn rather than real checkboxes: a still has no controls. */}
        <ul data-type="taskList">
          <li data-checked="true">
            <label>
              <span className="inline-block size-3 rounded-sm border border-accent bg-accent" />
            </label>
            <div>Review theme plan</div>
          </li>
          <li data-checked="false">
            <label>
              <span className="inline-block size-3 rounded-sm border border-accent" />
            </label>
            <div>Pick a palette</div>
          </li>
        </ul>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1 px-2.5 pb-2">
        <span className="truncate text-[10px] text-muted">Draft saved.</span>
        <Maximize2 size={13} className="text-muted" />
        <span className="justify-self-end rounded-md bg-accent px-2 py-1 text-[11px] font-semibold text-on-accent">
          Add note
        </span>
      </div>
      <div className="flex items-center gap-1 border-t border-line px-2 py-1.5 text-[11px]">
        <span className="rounded bg-soft px-1.5 font-medium text-accent">All 3</span>
        <span className="px-1.5">Pinned</span>
        <span className="ml-1 flex-1 rounded border border-line bg-bg px-1.5 text-muted">Search</span>
      </div>
      <div className="border-t border-line bg-bg px-2.5 py-1.5">
        <p className="font-medium" style={{ fontFamily: 'var(--fn-note-font)' }}>
          Flight check-in opens 09:40
        </p>
        <p className="text-[10px] text-muted">
          <span className="font-semibold text-accent">Pinned</span> · Today · 08:12
        </p>
      </div>
    </div>
  );
}
