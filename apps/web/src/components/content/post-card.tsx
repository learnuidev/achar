import Link from 'next/link';
import { ArrowRightIcon } from 'lucide-react';
import { Badge, Card, CardContent, cn } from '@achar/ui';
import { formatDate } from '@/lib/format';
import type { Post } from '@/content/types';

/**
 * One post, in the two sizes the blog uses.
 *
 * `featured` is a layout rather than a second component: the lead post and the
 * ones under it carry the same fields, and a separate component would be a second
 * place for the date, the categories and the excerpt to be got right.
 *
 * The cover image is an `<img>` rather than `next/image` on purpose. The address
 * of an asset is a deployment value — it comes off the content CDN a project was
 * given — and `next/image` wants its hostnames known at build time, which would
 * make a dataset that moved its media a rebuild.
 */
export function PostCard({ post, featured = false }: { post: Post; featured?: boolean }) {
  const date = formatDate(post.publishedAt);

  return (
    <Card
      className={cn(
        'group relative h-full overflow-hidden border-border/70 transition-colors hover:border-primary/40',
        featured && 'md:flex md:flex-row',
      )}
    >
      {post.coverImage ? (
        <div className={cn('overflow-hidden', featured ? 'md:w-1/2' : '')}>
          <img
            src={post.coverImage}
            alt=""
            loading="lazy"
            className="h-44 w-full object-cover transition-transform duration-500 group-hover:scale-105 md:h-full"
          />
        </div>
      ) : null}

      <CardContent className={cn('flex flex-1 flex-col gap-3 pt-6', featured && 'md:justify-center md:p-8')}>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {date ? <time dateTime={post.publishedAt}>{date}</time> : <span>Draft</span>}
          {post.categories.map((category) => (
            <Badge key={category.id} variant="secondary">
              {category.title}
            </Badge>
          ))}
        </div>

        <Link href={`/blog/${post.slug}`} className="after:absolute after:inset-0">
          <h3
            className={cn(
              'font-semibold tracking-tight underline-offset-4 group-hover:underline',
              featured ? 'text-2xl sm:text-3xl' : 'text-lg',
            )}
          >
            {post.title}
          </h3>
        </Link>

        {post.excerpt ? (
          <p className={cn('text-muted-foreground', featured ? 'text-base leading-relaxed' : 'text-sm')}>
            {post.excerpt}
          </p>
        ) : null}

        <div className="mt-auto flex items-center gap-2 pt-4 text-sm text-muted-foreground">
          {post.author ? <span>{post.author.name}</span> : null}
          <ArrowRightIcon className="ml-auto size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </div>
      </CardContent>
    </Card>
  );
}
