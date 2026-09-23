import { Fragment } from 'react';
import { highlight } from '../../lib/search';

/**
 * Render text with search matches wrapped in <mark>.
 *
 * The segments come from the search module as data, so matched text is never
 * assembled into an HTML string — note bodies are untrusted input.
 */
export function Highlighted({ text, terms }: { text: string; terms: string[] }) {
  if (terms.length === 0) return <>{text}</>;
  return (
    <>
      {highlight(text, terms).map((segment, index) =>
        segment.match ? (
          <mark key={index}>{segment.text}</mark>
        ) : (
          <Fragment key={index}>{segment.text}</Fragment>
        ),
      )}
    </>
  );
}
