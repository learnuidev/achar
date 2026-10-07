/**
 * Every URL the studio builds, in one place.
 *
 * Written out rather than interpolated at each call site because these paths
 * have four segments and two of them are variable: a link spelled by hand once
 * and differently the second time is a 404 that only shows up in a demo.
 *
 * Every one of them is built from `base`, because the studio is served from the
 * site's app under `/studio` and the prefix is the one thing that has to be true
 * everywhere at once. A route spelled by hand somewhere else is a link that
 * leaves the studio without saying so — and the page it lands on is a marketing
 * page, which is a failure nobody reports as a bug.
 */

/** Where the studio starts. The site owns `/`, and this is the whole of what is not the site. */
export const base = '/studio';

export const routes = {
  projectPicker: () => base,
  project: (projectId: string) => `${base}/projects/${projectId}`,
  members: (projectId: string) => `${base}/projects/${projectId}/members`,
  dataset: (projectId: string, dataset: string) => `${base}/projects/${projectId}/${dataset}`,
  content: (projectId: string, dataset: string, type: string) =>
    `${base}/projects/${projectId}/${dataset}/content/${type}`,
  document: (projectId: string, dataset: string, type: string, documentId: string) =>
    `${base}/projects/${projectId}/${dataset}/content/${type}/${encodeURIComponent(stripDraftId(documentId))}`,
  newDocument: (projectId: string, dataset: string, type: string) =>
    `${base}/projects/${projectId}/${dataset}/content/${type}?new=1`,
  assets: (projectId: string, dataset: string) => `${base}/projects/${projectId}/${dataset}/assets`,
  schema: (projectId: string, dataset: string) => `${base}/projects/${projectId}/${dataset}/schema`,
  api: (projectId: string, dataset: string) => `${base}/projects/${projectId}/${dataset}/api`,
  signIn: () => `${base}/sign-in`,
  authCallback: () => `${base}/auth/callback`,
};

/** The prefix a draft's id carries. The pair is the whole draft/publish model. */
export const DRAFT_PREFIX = 'drafts.';

/**
 * The id a document is addressed by, without its draft prefix.
 *
 * The two rows are one document to a person, and only one of them belongs in a
 * URL: `/content/post/drafts.abc` would make every link depend on which copy
 * happened to exist when the link was copied.
 */
export function stripDraftId(documentId: string): string {
  return documentId.startsWith(DRAFT_PREFIX) ? documentId.slice(DRAFT_PREFIX.length) : documentId;
}

/** The id of a document's draft row. */
export function draftIdOf(documentId: string): string {
  return `${DRAFT_PREFIX}${stripDraftId(documentId)}`;
}

/**
 * A new document's id.
 *
 * Minted on the client so the editor can open on a document that does not exist
 * yet — the first keystroke is what creates it, which is why a half-written
 * document never becomes a published one and never becomes an empty row either.
 */
export function newDocumentId(): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${random}`;
}
