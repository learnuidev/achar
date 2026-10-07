import type { MetadataRoute } from 'next';
import { getPages, getPosts } from '@/content';
import { absoluteUrl } from '@/lib/site';

/**
 * The sitemap, from the content layer.
 *
 * The static routes are listed here because they are components; the blog posts
 * and the `page` documents are listed because they are documents, which is why
 * this file has to be async and why it goes through the same readers everything
 * else does. A new post is in the sitemap the next time it revalidates, without
 * anybody editing this file.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [posts, pages] = await Promise.all([getPosts(), getPages()]);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: absoluteUrl('/'), changeFrequency: 'weekly', priority: 1 },
    { url: absoluteUrl('/product'), changeFrequency: 'monthly', priority: 0.9 },
    { url: absoluteUrl('/pricing'), changeFrequency: 'monthly', priority: 0.9 },
    { url: absoluteUrl('/customers'), changeFrequency: 'monthly', priority: 0.8 },
    { url: absoluteUrl('/blog'), changeFrequency: 'weekly', priority: 0.8 },
  ];

  const postRoutes: MetadataRoute.Sitemap = posts.map((post) => ({
    url: absoluteUrl(`/blog/${post.slug}`),
    lastModified: post.publishedAt,
    changeFrequency: 'yearly',
    priority: 0.6,
  }));

  const pageRoutes: MetadataRoute.Sitemap = pages.map((page) => ({
    url: absoluteUrl(`/${page.slug}`),
    changeFrequency: 'monthly',
    priority: 0.5,
  }));

  return [...staticRoutes, ...postRoutes, ...pageRoutes];
}
