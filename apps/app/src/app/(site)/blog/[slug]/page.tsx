import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, Separator } from '@achar/ui';
import { AuthorCard } from '@/components/content/author-card';
import { PortableText } from '@/components/studio/portable-text';
import { PostCard } from '@/components/content/post-card';
import { getPost, getPosts } from '@/content';
import { formatLongDate } from '@/lib/format';

/**
 * One post.
 *
 * `params` is a `Promise` in Next 16 and is awaited once, at the top, into a
 * local — the alternative is `(await params).slug` at four call sites, which is
 * four chances for one of them to forget.
 *
 * The route is statically generated for every post in the corpus and revalidated
 * on a window, so a publish shows up without a redeploy while a reader gets a page
 * that was already built.
 */
export const revalidate = 300;

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  const posts = await getPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);

  if (!post) return { title: 'Post not found' };

  return {
    title: post.title,
    description: post.excerpt,
    openGraph: {
      type: 'article',
      title: post.title,
      description: post.excerpt,
      publishedTime: post.publishedAt,
      images: post.coverImage ? [post.coverImage] : undefined,
    },
  };
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPost(slug);

  if (!post) notFound();

  const date = formatLongDate(post.publishedAt);
  const related = await relatedPosts(post);

  return (
    <article className="border-b border-border/60">
      <header className="border-b border-border/60 bg-muted/20">
        <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <Link href="/blog" className="transition-colors hover:text-foreground">
              Blog
            </Link>
            {post.categories.map((category) => (
              <Badge key={category.id} variant="secondary">
                {category.title}
              </Badge>
            ))}
          </div>

          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            {post.title}
          </h1>

          {post.excerpt ? (
            <p className="mt-6 text-lg text-muted-foreground">{post.excerpt}</p>
          ) : null}

          <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            {post.author ? <span className="font-medium text-foreground">{post.author.name}</span> : null}
            {date ? <time dateTime={post.publishedAt}>{date}</time> : null}
          </div>
        </div>
      </header>

      {post.coverImage ? (
        <div className="mx-auto w-full max-w-4xl px-4 pt-12 sm:px-6">
          <img
            src={post.coverImage}
            alt=""
            className="w-full rounded-2xl border border-border object-cover"
          />
        </div>
      ) : null}

      <div className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6">
        <PortableText value={post.body} />

        {post.author ? (
          <>
            <Separator className="my-14" />
            <AuthorCard author={post.author} />
          </>
        ) : null}
      </div>

      {related.length > 0 ? (
        <div className="border-t border-border/60 bg-muted/20">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-2xl font-semibold tracking-tight">Related posts</h2>
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((other) => (
                <PostCard key={other.id} post={other} />
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}

/**
 * Up to three other posts, sharing a category if one can be found.
 *
 * "Related" is computed rather than authored: a manual related-posts field is
 * another thing for an editor to fill in and forget, and two posts filed under
 * the same category is a relationship the corpus already states.
 */
async function relatedPosts(post: Awaited<ReturnType<typeof getPost>>) {
  if (!post) return [];

  const posts = await getPosts();
  const categoryIds = post.categories.map((category) => category.id);

  const sharing = posts.filter(
    (other) =>
      other.id !== post.id && other.categories.some((category) => categoryIds.includes(category.id)),
  );

  // Newest first, and backfilled with whatever else there is — three unrelated
  // posts at the bottom of an article is a better ending than one.
  const rest = posts.filter(
    (other) => other.id !== post.id && !sharing.some((shared) => shared.id === other.id),
  );

  return [...sharing, ...rest].slice(0, 3);
}
