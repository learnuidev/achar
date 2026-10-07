/**
 * The two bits of emphasis the reference's prose uses — `code` and **bold**.
 *
 * A tiny renderer rather than JSX in the data, so the reference stays one object
 * per endpoint: a note that had to be split into spans would be a note nobody adds
 * to. It lives beside the cards rather than inside one of them because four things
 * render this prose — an endpoint's description and notes, a field's description, an
 * error's meaning, and the conventions — and four copies of a renderer are four
 * answers to "what does one backtick mean".
 *
 * **The two nest, bold outside code**, because that is how most of this reference is
 * written: `**A field that is portable text is answered in its canonical form**` and
 * `**409 \`TYPE_EXISTS\`**` are both sentences somebody would write, and a flat split
 * on the pair of them renders the inner backticks as characters. So bold is matched
 * first and the run inside it is rendered for code — which is the whole of the
 * nesting rule, and one level is all this syntax has.
 *
 * It is a two-token renderer and not Markdown, deliberately: one asterisk is not
 * italic, and neither an asterisk nor a backtick can be escaped. Prose that wants
 * more than this wants a component.
 */
export function renderEmphasis(text: string): React.ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={index} className="font-medium text-foreground">
          {renderCode(part.slice(2, -2))}
        </strong>
      );
    }
    return <span key={index}>{renderCode(part)}</span>;
  });
}

/** The `code` half — and the only emphasis allowed inside a bold run. */
function renderCode(text: string): React.ReactNode {
  return text.split(/(`[^`]+`)/g).map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={index} className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={index}>{part}</span>;
  });
}
