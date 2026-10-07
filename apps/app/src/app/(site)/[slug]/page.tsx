import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { PortableText as PortableTextValue } from '@achar/types';
import { PortableText } from '@/components/studio/portable-text';
import { getPage, getPages } from '@/content';

/**
 * A page somebody wrote in the studio.
 *
 * This is the route that makes the point the rest of the site is arguing: `/about`
 * and `/privacy` are not components here, they are `page` documents, authored in
 * the same studio as everything else and rendered through the same rich-text
 * renderer as a blog post. Adding a page to this site is saving a document.
 *
 * It is the catch-all, so it sits last in the router: `/product`, `/pricing`,
 * `/customers` and `/blog` are real routes and win, and everything else asks the
 * content layer whether a document claims it.
 */
export const revalidate = 300;

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  const pages = await getPages();
  return pages.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPage(slug);

  if (!page) return { title: 'Page not found' };

  // A page document has a title and a body, and no excerpt field — so the first
  // paragraph is the description. Deriving it beats adding a field to the schema
  // that only search engines read.
  //
  // `absolute` because a standing page's title is the whole title: the seed's own
  // pages are called "About Achar" and "Security at Achar", and the layout's
  // `%s — Achar` template would turn the first of those into "About Achar — Achar".
  return {
    title: { absolute: page.title },
    description: firstParagraph(page.body),
  };
}

export default async function CmsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getPage(slug);

  if (!page) notFound();

  return (
    <article className="border-b border-border/60">
      <header className="border-b border-border/60 bg-muted/20">
        <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
          <p className="text-xs font-medium uppercase tracking-widest text-primary">Achar</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            {page.title}
          </h1>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6">
        <PortableText value={page.body} />
      </div>
    </article>
  );
}

/** The first paragraph's text, which is the closest a page document has to a summary. */
function firstParagraph(body: PortableTextValue): string | undefined {
  for (const node of body) {
    if (node._type !== 'block' || node.style !== 'normal') continue;
    const text = (node.children ?? [])
      .map((span) => span.text)
      .join('')
      .trim();
    if (text.length > 0) return text;
  }
  return undefined;
}
