import { Card, CardContent, Separator } from '@achar/ui';
import type { Author } from '@/content/types';

/**
 * The person a post is by.
 *
 * The avatar falls back to initials rather than to a grey circle: an author
 * document is written once and photographed later, and a page that shows a
 * placeholder silhouette beside a byline reads as broken in a way initials do
 * not. Initials are derived from the name, so there is nothing to fill in.
 */
export function AuthorCard({ author, className }: { author: Author; className?: string }) {
  return (
    <Card className={className}>
      <CardContent className="flex gap-4 pt-6">
        <Avatar author={author} />

        <div className="flex flex-col gap-2">
          <div>
            <p className="font-medium">{author.name}</p>
            {author.role ? <p className="text-sm text-muted-foreground">{author.role}</p> : null}
          </div>

          {author.bio ? <p className="text-sm leading-relaxed text-muted-foreground">{author.bio}</p> : null}

          {author.links.length > 0 ? (
            <>
              <Separator />
              <ul className="flex flex-wrap gap-4 text-sm">
                {author.links.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      rel="noreferrer noopener"
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function Avatar({ author }: { author: Author }) {
  if (author.avatar) {
    return (
      <img
        src={author.avatar}
        alt=""
        loading="lazy"
        className="size-12 shrink-0 rounded-full border border-border object-cover"
      />
    );
  }

  return (
    <span
      aria-hidden
      className="flex size-12 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-sm font-medium text-muted-foreground"
    >
      {initials(author.name)}
    </span>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
