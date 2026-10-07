/**
 * The model, as this deployment has it.
 *
 * **AWS Bedrock, called through the Converse API**, and the two halves of that
 * sentence are both decisions:
 *
 * - Bedrock rather than a vendor's own endpoint, because the credential is the
 *   Lambda's own IAM role. There is no API key in an environment variable, nothing
 *   to rotate, and nothing for the console to hold — which is the same reason the
 *   rest of this service talks to DynamoDB, S3 and SES the way it does.
 * - **Converse** rather than `InvokeModel`, because `InvokeModel`'s request body is
 *   the model family's own JSON: Anthropic's shape is not Amazon's, and a deployment
 *   that changed `TRANSLATION_MODEL` would then need this file changed too. Converse
 *   takes one shape for every model Bedrock serves, so the model really is a config
 *   value.
 *
 * A deployment with no `TRANSLATION_MODEL` has no model and **says so** rather than
 * guessing one (see `translationModel`): a wrong model id fails with
 * `AccessDeniedException`, which reads like a permissions problem and is not one.
 */

import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

import { HttpError } from './http';

/**
 * The model this deployment translates with, or `null` when it has not been told.
 *
 * Read per call rather than at module load, because a Lambda's environment is the
 * deployment's and a module-level read would bake the first invocation's answer in.
 */
export function translationModel(): string | null {
  const model = (process.env.TRANSLATION_MODEL ?? '').trim();
  return model === '' ? null : model;
}

/**
 * The model, or a 501 that says which variable to set.
 *
 * A deployment with no model is not broken — everything else about it works, and
 * translation is a feature somebody chooses to pay for — so this is an explicit
 * "not configured" rather than a failure to guess a model id.
 */
export function requireTranslationModel(): string {
  const model = translationModel();
  if (!model) {
    throw new HttpError(
      501,
      'TRANSLATION_NOT_CONFIGURED',
      'This deployment has no translation model — set TRANSLATION_MODEL to a Bedrock model id',
      { variable: 'TRANSLATION_MODEL' },
    );
  }
  return model;
}

/** One piece of text to translate, and what it is, for the model's own context. */
export interface TranslationItem {
  /** A stable id the answer comes back under — the field's path, with indices. */
  id: string;
  text: string;
  /**
   * The sentence the fragment sits in, when it is a fragment of one.
   *
   * Rich text is stored as runs of text with the same marks, so a paragraph with a
   * bold phrase in it is three items — and translating three fragments blind gives
   * three fragments that do not join up in a language with different word order.
   * The context is not translated and is not answered: it is what the model reads to
   * know what the fragment is part of.
   */
  context?: string;
}

export interface TranslationRequest {
  /** The language being translated from, as a code, for the prompt's own words. */
  from: string;
  /** The language being translated into. */
  to: string;
  /** Names for both, because "French" is a different instruction from "fr". */
  fromName: string;
  toName: string;
  items: TranslationItem[];
}

/**
 * The instruction, and the shape of the answer.
 *
 * Two things are being asked for and the second is not decoration. The **answer is
 * JSON keyed by the ids it was given** — a model asked for prose answers with prose,
 * and matching prose back to fields is guesswork this file would have to do per
 * language. And the **only text in the answer is the translation**: a model that
 * adds "Here is the French:" has added a sentence to somebody's website, so the
 * prompt says what the answer is and the parser refuses anything that is not it.
 */
const SYSTEM = [
  'You translate content for a content management system.',
  'You are given a list of items, each with an id and a text. Each text is a field of a document, or a fragment of one.',
  'Translate every text into the target language and answer with JSON only: an object whose keys are the ids you were given and whose values are the translations.',
  'Answer nothing else — no explanation, no markdown, no code fences.',
  'If an item has a `context`, it is the sentence the fragment belongs to: use it to choose the right wording and gender, translate the `text` alone, and do not answer the context.',
  'Keep placeholders, product names, code and URLs as they are unless they are ordinary words in the target language.',
  'Keep the tone of the source. Do not add, remove or explain anything.',
].join(' ');

/**
 * The translations, keyed by the ids they were asked about.
 *
 * A model that answers with something else — no JSON, a missing id, a value that is
 * not a string — is a failure rather than a partial success: half a translated
 * document is worse than none, because the half that arrived looks finished.
 */
export async function translateWithBedrock(
  request: TranslationRequest,
): Promise<Record<string, string>> {
  const model = requireTranslationModel();

  const runtime = new BedrockRuntimeClient({
    // The deployment's region, which is the one the function runs in: a model id
    // without a region prefix is served there, and a cross-region profile id
    // (`us.…`) routes from there.
    region: process.env.REGION ?? process.env.AWS_REGION,
  });

  let text: string;
  try {
    const answer = await runtime.send(
      new ConverseCommand({
        modelId: model,
        system: [{ text: SYSTEM }],
        messages: [
          {
            role: 'user',
            content: [
              {
                text: [
                  `Translate from ${request.fromName} (${request.from}) into ${request.toName} (${request.to}).`,
                  JSON.stringify({ items: request.items }),
                ].join('\n'),
              },
            ],
          },
        ],
        // Deterministic, and generous enough for a document: a model that stops
        // early answers with a truncated object, which the parser refuses.
        inferenceConfig: { temperature: 0, maxTokens: 8192 },
      }),
    );

    text = (answer.output?.message?.content ?? [])
      .map((part) => part.text ?? '')
      .join('')
      .trim();
  } catch (cause) {
    // The provider's own sentence, because the failures worth acting on are all
    // about the deployment: a model this account has not been granted, a region
    // that does not serve it, throttling. Rewriting them into "translation failed"
    // would hide the one line that says which.
    throw new HttpError(502, 'TRANSLATION_FAILED', `Bedrock refused the translation: ${message(cause)}`, {
      model,
    });
  }

  return parseTranslations(text, request, model);
}

/** The answer as an object of ids to translations, or a 502 saying what came back instead. */
function parseTranslations(
  text: string,
  request: TranslationRequest,
  model: string,
): Record<string, string> {
  const parsed = parseJson(text);
  if (!parsed) {
    throw new HttpError(502, 'TRANSLATION_FAILED', 'The model answered with something that is not JSON', {
      model,
      answer: snippet(text),
    });
  }

  const translations: Record<string, string> = {};
  const missing: string[] = [];

  for (const item of request.items) {
    const value = parsed[item.id];
    if (typeof value === 'string' && value.trim() !== '') {
      translations[item.id] = value;
      continue;
    }
    missing.push(item.id);
  }

  if (missing.length > 0) {
    throw new HttpError(
      502,
      'TRANSLATION_FAILED',
      `The model did not answer for ${missing.length} of ${request.items.length} fields`,
      { model, missing },
    );
  }

  return translations;
}

/**
 * JSON out of an answer that may wear a code fence.
 *
 * Fences are refused by the prompt and appear anyway — every model does it
 * sometimes — and a translation lost to three backticks is a translation somebody
 * has to ask for twice.
 */
function parseJson(text: string): Record<string, unknown> | null {
  const candidates = [text, stripFence(text)];
  for (const candidate of candidates) {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end <= start) continue;
    try {
      const parsed: unknown = JSON.parse(candidate.slice(start, end + 1));
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // The next candidate, or the caller's 502.
    }
  }
  return null;
}

function stripFence(text: string): string {
  return text.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '');
}

function snippet(text: string): string {
  const one = text.replace(/\s+/g, ' ').trim();
  return one.length > 200 ? `${one.slice(0, 200)}…` : one;
}

function message(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  return String(cause);
}
