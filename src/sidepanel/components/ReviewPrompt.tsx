import { t } from '../../lib/i18n';

/** How many notes the panel must hold before it asks. */
export const REVIEW_AFTER_NOTES = 10;

/**
 * A single, quiet request for a store review. It appears once the panel holds
 * enough notes to have proven useful, sits out of the way above the footer,
 * and is answered for good by either button.
 */
export function ReviewPrompt({ onAnswer }: { onAnswer: (wantsToReview: boolean) => void }) {
  return (
    <div className="mx-4 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-[7px] bg-soft px-2.5 py-2 text-xs">
      <span>{t('reviewPrompt')}</span>
      <span className="flex gap-1">
        <button type="button" className="fn-btn fn-btn-small" onClick={() => onAnswer(true)}>
          {t('reviewLeave')}
        </button>
        <button type="button" className="fn-btn fn-btn-quiet fn-btn-small" onClick={() => onAnswer(false)}>
          {t('reviewNoThanks')}
        </button>
      </span>
    </div>
  );
}
