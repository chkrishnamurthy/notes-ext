/**
 * Keeping one composer draft in step across every open panel.
 *
 * There is a single draft, and with an overlay in every tab there can be many
 * panels showing it. Each one writes the draft as its user types, so without
 * coordination they overwrite one another: an unfinished thought in one tab is
 * replaced by typing in another, and lost when that tab closes.
 *
 * So the draft is shared live. A panel adopts a draft another panel wrote —
 * except while it has unsaved typing of its own, which it is about to write
 * anyway and must never have thrown away underneath it.
 */

/** The parts of a draft that decide what the composer shows. */
export interface DraftSnapshot {
  html: string;
  editingId?: string;
  editingRev?: number;
}

export const EMPTY_SNAPSHOT: DraftSnapshot = { html: '' };

export function sameDraft(a: DraftSnapshot, b: DraftSnapshot): boolean {
  return a.html === b.html && a.editingId === b.editingId && a.editingRev === b.editingRev;
}

/**
 * Whether a panel should replace its composer with a draft it has just seen
 * arrive in storage.
 *
 * @param incoming The draft now in storage.
 * @param synced   What this panel last wrote or adopted.
 * @param local    What this panel's composer shows right now.
 */
export function shouldAdopt(
  incoming: DraftSnapshot,
  synced: DraftSnapshot,
  local: DraftSnapshot,
): boolean {
  // Nothing new — including the echo of this panel's own write.
  if (sameDraft(incoming, synced)) return false;
  // Typing here that has not been written yet wins; it lands in a moment.
  if (!sameDraft(local, synced)) return false;
  return true;
}
