/**
 * The two bits of emphasis the reference's prose uses — `code` and **bold**.
 *
 * A tiny renderer rather than JSX in the data, so the reference stays one object
 * per endpoint: a note that had to be split into spans would be a note nobody adds
 * to. It lives beside the cards rather than inside one of them because three
 * things render this prose — an endpoint's notes, an error's meaning, and the
 * conventions — and three copies of a renderer are three answers to "what does one
 * backtick mean".
 */
export function renderEmphasis(text: string): React.ReactNode {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);

  return parts.map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={index} className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={index} className="font-medium text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={index}>{part}</span>;
  });
}
