import type { Metadata } from 'next';
import { PostCard } from '@/components/content/post-card';
import { FinalCta } from '@/components/sections/final-cta';
import { getCategories, getPosts, getSiteSettings } from '@/content';

/**
 * The blog index.
 *
 * The lead post first — the one a `featured` flag names, or the newest if nobody
 * has flagged one — and then the rest grouped by the categories they reference.
 * Grouping by category rather than by date is the point of having categories: a
 * reader who wants the engineering posts should be able to see where they start
 * without a filter bar that reloads the page.
 *
 * A post with no categories is not dropped; it lands in a last section, because a
 * document that exists and is not linked from anywhere is a document nobody
 * wrote.
 */
export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Blog',
    description:
      'Notes on content modelling, query languages, publishing workflows and the parts of a content system that are somebody’s code rather than somebody’s copy.',
  };
}

export default async function BlogPage() {
  const [settings, posts, categories] = await Promise.all([
    getSiteSettings(),
    getPosts(),
    getCategories(),
  ]);

  const featured = posts.find((post) => post.featured) ?? posts[0];
  const rest = posts.filter((post) => post.id !== featured?.id);
  const uncategorised = rest.filter((post) => post.categories.length === 0);

  const groups = categories
    .map((category) => ({
      category,
      posts: rest.filter((post) => post.categories.some((own) => own.id === category.id)),
    }))
    .filter((group) => group.posts.length > 0);

  return (
    <>
      <section className="border-b border-border/60">
        <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
          <div className="max-w-3xl">
            <p className="text-xs font-medium uppercase tracking-widest text-primary">Blog</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              Notes from people who spend their week on content models.
            </h1>
            <p className="mt-6 text-lg text-muted-foreground">
              {posts.length} posts, written as copy rather than as filler, because the layout
              problems worth finding are the ones a long headline or a code block finds.
            </p>
          </div>

          {featured ? (
            <div className="mt-14">
              <PostCard post={featured} featured />
            </div>
          ) : (
            <p className="mt-14 text-sm text-muted-foreground">
              No posts yet. Write one in the studio and it appears here.
            </p>
          )}
        </div>
      </section>

      {groups.length > 0 || uncategorised.length > 0 ? (
        <section className="border-b border-border/60 bg-muted/20">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-4 py-20 sm:px-6 sm:py-24">
            {groups.map((group) => (
              <div key={group.category.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 pb-4">
                  <h2 className="text-2xl font-semibold tracking-tight">{group.category.title}</h2>
                  {group.category.description ? (
                    <p className="max-w-xl text-sm text-muted-foreground">
                      {group.category.description}
                    </p>
                  ) : null}
                </div>

                <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {group.posts.map((post) => (
                    <PostCard key={`${group.category.id}-${post.id}`} post={post} />
                  ))}
                </div>
              </div>
            ))}

            {uncategorised.length > 0 ? (
              <div>
                <h2 className="border-b border-border/60 pb-4 text-2xl font-semibold tracking-tight">
                  More posts
                </h2>
                <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {uncategorised.map((post) => (
                    <PostCard key={post.id} post={post} />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <FinalCta primaryCta={settings.primaryCta} secondaryCta={settings.secondaryCta} />
    </>
  );
}
