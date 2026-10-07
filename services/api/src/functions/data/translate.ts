/**
 * `POST /v1/data/translate/{p}/{d}` — a model translates a document into a language.
 *
 * The route exists because translation is the one kind of content work that is
 * mechanical and enormous: a site with four hundred posts and six languages is two
 * thousand translations nobody has time for, and every one of them is a thing a model
 * does well enough for a person to finish. What it is **not** is a way to publish
 * without a person, and the whole of that promise is in three decisions here:
 *
 * - **The translation goes into the draft.** Not the published row, not a new
 *   document: the same draft/publish pair every other write uses, so what a site
 *   serves does not change until somebody publishes.
 * - **The document records that a model wrote it.** `_translations[language]` says
 *   `source: 'ai'` with the model's id, and **`publish` refuses while any such
 *   language is unapproved** — so the work is a model's and the responsibility is a
 *   person's, and the second cannot be skipped by a script, a client bug or haste.
 * - **The answer is per string, at a path.** See `lib/translate.ts`: rich text keeps
 *   its structure, a field with nothing in it is not sent, and what comes back is
 *   applied as a patch of dotted paths through the same machinery an editor's save
 *   uses — same validation, same revision, same conflict rules.
 *
 * A document that is too large to translate in one call is translated in pieces:
 * `fields` narrows the request to a path and anything under it.
 */

import type { AcharDocument, TranslationResult } from '@achar/types';
import { requireDatasetAccess } from '../../lib/access';
import { requireViewer } from '../../lib/auth';
import { languageName } from '@achar/schema';
import { applyMutations, readRows, toApiDocument, publishedIdOf } from '../../lib/documents';
import { recordDatasetChange } from '../../lib/datasets';
import { translateWithBedrock, requireTranslationModel } from '../../lib/bedrock';
import { notify } from '../../lib/events';
import { languagesOf, readLanguage } from '../../lib/languages';
import {
  HttpError,
  json,
  jsonBody,
  listField,
  pathParam,
  requiredStringField,
  stringField,
  withHandler,
  type ApiEvent,
} from '../../lib/http';
import { assertValidDocument, coerceDocumentFields, documentType, getDatasetSchema } from '../../lib/schemas';
import { collectSlots, translatedFields, translationPatch } from '../../lib/translate';

async function main(event: ApiEvent) {
  const viewer = await requireViewer(event);
  const projectId = pathParam(event, 'projectId');
  const dataset = pathParam(event, 'dataset');
  const access = await requireDatasetAccess(projectId, dataset, viewer, 'write');

  const body = jsonBody(event);
  const id = publishedIdOf(requiredStringField(body, 'id'));
  const languages = languagesOf(access.dataset);

  // The target is required and the source is not: "translate this into French" is
  // the request somebody makes, and the language to translate *from* is the
  // dataset's default until they say otherwise.
  const to = readLanguage(requiredStringField(body, 'language'), {
    datasetName: access.dataset.datasetName,
    ...languages,
  });
  const from = readLanguage(stringField(body, 'from'), {
    datasetName: access.dataset.datasetName,
    ...languages,
  });

  if (from === to) {
    throw new HttpError(400, 'BAD_REQUEST', `from and language are both ${to}`, {
      field: 'language',
      language: to,
    });
  }

  const fields = listField(body, 'fields')?.filter((entry): entry is string => typeof entry === 'string');
  // Before anything is read: a deployment with no model answers the same 501 whether
  // or not this particular document happens to have anything to translate, and
  // finding that out after a read and a scan of the schema would be work for a
  // request that cannot succeed.
  const model = requireTranslationModel();

  const schema = await getDatasetSchema(projectId, dataset);

  const rows = await readRows(projectId, dataset, id);
  const base = rows.draft ?? rows.published;
  if (!base) {
    throw new HttpError(404, 'DOCUMENT_NOT_FOUND', `Document ${id} not found`, { documentId: id });
  }

  const typeName = typeof base._type === 'string' ? base._type : '';
  const type = documentType(schema, typeName);
  if (!type) {
    throw new HttpError(400, 'UNKNOWN_TYPE', `${typeName || 'That document'} is not a type in this schema`, {
      type: typeName,
      types: schema.types.map((entry) => entry.name),
    });
  }

  // Stored, not delivered: a model is translating the values a person typed, and an
  // asset resolved to a CDN address is a string nobody wants translated.
  const document = toApiDocument(base, {
    draft: base.draft,
    published: rows.published !== undefined,
    editable: true,
  });

  const collected = collectSlots(type, document, {
    from,
    to,
    defaultLanguage: languages.defaultLanguage,
    ...(fields && fields.length > 0 ? { fields } : {}),
  });

  const nothing = collected.slots.length === 0;

  // Nothing to translate is an answer rather than an error: the draft is unchanged,
  // no model was called, and the caller is told which paths there was nothing in.
  const translations = nothing
    ? {}
    : await translateWithBedrock({
        from,
        to,
        fromName: languageName(from),
        toName: languageName(to),
        items: collected.slots.map((slot) => slot.item),
      });

  const set = translationPatch(collected, translations);
  const written = Object.keys(set).length;

  if (written > 0) {
    const validate = (document: AcharDocument, stage: 'draft' | 'published'): void =>
      assertValidDocument(schema, document, {
        requireComplete: stage === 'published',
        defaultLanguage: languages.defaultLanguage,
      });

    // One patch, on the id: `applyPatch` reads the draft when there is one and the
    // published row when there is not, so a document that has never been edited
    // since it was published gets a **draft that is the published document plus the
    // translation** — no empty draft, and nothing else touched.
    const applied = await applyMutations({
      projectId,
      dataset,
      atomic: true,
      mutations: [{ patch: { id, set } }],
      validate,
      coerce: (sent) => coerceDocumentFields(schema, sent),
      typeOf: (name) => documentType(schema, name),
      defaultLanguage: languages.defaultLanguage,
      // The provenance, and the reason this route is the only one that may write it:
      // a model wrote this language, and the row says so until a person approves it.
      aiTranslation: { language: to, model },
    });

    await recordDatasetChange(projectId, dataset, { mutated: true });
    await notify(projectId, dataset, applied.results);
  }

  // Read back rather than assembled: what the answer carries is the draft as it now
  // stands, which is what the studio draws next, and a document returned from a
  // write this route composed would be one more place that can disagree with the table.
  const after = await readRows(projectId, dataset, id);
  const draft = after.draft ?? after.published;
  const answered: TranslationResult = {
    documentId: id,
    language: to,
    from,
    model,
    fields: translatedFields(collected),
    skipped: collected.skipped,
    document: draft
      ? toApiDocument(draft, { draft: true, published: after.published !== undefined, editable: true })
      : document,
  };

  return json(answered);
}

export const handler = withHandler(main);
