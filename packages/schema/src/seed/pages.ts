import type { AcharDocument } from '@achar/types';

import { seedDocument } from './document';
import { bodyFor } from './portable-text';

/**
 * The site's own pages.
 *
 * Every one of these is a `page` document rather than a component, and that is the
 * point the rest of the site is arguing: `/about` and `/privacy` are authored in
 * the same studio as everything else, rendered through the same rich-text
 * renderer as a blog post, and adding one is saving a document. `apps/web`'s
 * `[slug]` route is the catch-all that reads them — which is why the footer can
 * link to `/sub-processors` without anybody writing a `sub-processors.tsx`.
 *
 * The footer's link columns and the settings document's two calls to action are
 * the specification: every href in `site-footer.tsx` and in `siteSettings`
 * resolves to one of these documents, so nothing on the site 404s.
 *
 * **One builder per page, made once.** `bodyFor` numbers the keys it hands out,
 * and that numbering is only unique within one builder — so calling `bodyFor`
 * afresh for each block would restart the count and put half a dozen
 * `page-security-1` keys in one document. The builder's own note says the same
 * thing; this is the call site that has to honour it. And `body.list()` returns an
 * *array* of blocks, so it is always spread.
 */

const about = bodyFor('page-about');
const security = bodyFor('page-security');
const privacy = bodyFor('page-privacy');
const terms = bodyFor('page-terms');
const contact = bodyFor('page-contact');
const careers = bodyFor('page-careers');
const status = bodyFor('page-status');
const processors = bodyFor('page-subprocessors');
const docs = bodyFor('page-docs');
const signup = bodyFor('page-signup');

export const seedPages: AcharDocument[] = [
  seedDocument('page-about', 'page', {
    title: 'About Achar',
    slug: 'about',
    body: [
      about.p(
        'Achar began with a complaint that is now old enough to be boring: the content was in one system, the shape of it was in another, and the code that knew what it meant was in a third. Every team that shipped a website had a document somewhere describing the fields, and that document was always slightly out of date.',
      ),
      about.h2('What we build'),
      about.p(
        'A content lake, a query language, and a studio. The lake stores documents rather than rows. The language reads them without an endpoint per shape of query. The studio is generated from the same model the API enforces, so the form an editor fills in and the validation a request is held to are the same description read twice.',
      ),
      about.quote(
        'You will change your design system three times in five years. You will change your content model once, badly, if you are not careful about it.',
      ),
      about.p(
        'That asymmetry is why we put the model first. A schema is not configuration here — it is the schema. It is what the studio draws, what the API validates against, and what a query may rely on. Change it in one place and every surface that read it sees a different description of the same content.',
      ),
      about.h2('How we work'),
      about.p(
        'Structured content is a discipline before it is a product, so we write about it. Almost everything on this site is a document in a dataset the product itself serves — including this page, which was written in the studio, saved as a draft, reviewed, and published.',
      ),
      ...about.list([
        'We ship the product and use the product, in that order and not the other way round.',
        'We write the reasoning down. A decision without its reasons is a decision somebody will reverse by accident.',
        'We keep the API small enough to hold in your head, and we add to it reluctantly.',
      ]),
    ],
  }),

  seedDocument('page-security', 'page', {
    title: 'Security',
    slug: 'security',
    body: [
      security.p(
        'Content is often the least protected thing a company owns, and it is frequently the most visible. This page describes what Achar does by default, what it deliberately leaves to you, and where the line between the two is.',
      ),
      security.h2('By default'),
      ...security.list([
        'Every asset bucket is private, with public access blocked, ACLs disabled, and encryption at rest. The only principal that can read it is the distribution in front of it.',
        'Every route but one requires a token. `GET /v1/info` is public on purpose, so a deployment can be asked whether it is up.',
        'API tokens are stored hashed and compared in constant time. The secret is shown once, at creation, and is unrecoverable afterwards by design.',
        'A project that does not exist and a project you are not a member of answer the same 403, so the API never confirms which project ids exist.',
        'Point-in-time recovery is on for every table, and every table and bucket is retained rather than deleted when a stack goes away.',
      ]),
      security.h2('Left to you'),
      security.p(
        'A public dataset is public. If a document is in one, its contents are readable by anybody who can reach the API, and no amount of token discipline changes that — the arrangement that protects something is a private dataset and a token that names the dataset it may read.',
      ),
      security.p(
        'Asset URLs are unsigned, and that is a decision rather than an oversight: an asset URL is published content that ends up in a document, in an `img` tag, and in somebody else\'s cache, and a URL that expires breaks all three. The protection is the unguessable key, and the token that had to be presented to learn it.',
      ),
      security.h2('Reporting'),
      security.p(
        'Send anything you find to security@achar.example, with enough detail to reproduce it. We will confirm receipt within one working day and say what we intend to do — including when the answer is that we do not consider it a vulnerability.',
      ),
    ],
  }),

  seedDocument('page-privacy', 'page', {
    title: 'Privacy',
    slug: 'privacy',
    body: [
      privacy.p(
        'Achar stores two kinds of personal data, and they are worth separating because the rules that apply to them are different. The first is the accounts of the people who use the product. The second is whatever personal data your editors choose to put inside a document.',
      ),
      privacy.h2('Your account'),
      ...privacy.list([
        'We store the email address, the name, and the sign-in provider you used. Sign-in is Cognito, and a federated sign-in shares the address the provider gives us.',
        'We never store a password for a federated account, because we never see one.',
        'We do not sell, rent, or share account data with anybody whose product you did not ask us to connect.',
      ]),
      privacy.h2('Your content'),
      privacy.p(
        'Content belongs to the project it is in. We do not read it, train on it, or mine it, and we have no mechanism to do any of those things — which is a stronger statement than a policy, because a policy can be changed and an absent capability cannot.',
      ),
      privacy.h2('Deleting things'),
      privacy.p(
        'Deleting a project deletes its datasets, documents, assets, tokens and memberships. Deleting a dataset deletes its documents and assets. Because content is the product and an accidental delete is unforgivable, tables and buckets are *retained* when a stack is destroyed — removing the data is a separate, explicitly-ticked step, and it says so out loud.',
      ),
      privacy.p(
        'Write to privacy@achar.example to ask what is held about you, to correct it, or to have it removed.',
      ),
    ],
  }),

  seedDocument('page-terms', 'page', {
    title: 'Terms of service',
    slug: 'terms',
    body: [
      terms.p(
        'These terms cover your use of Achar. The short version: you own your content, you are responsible for what you publish, and we are responsible for keeping the service running and your data intact.',
      ),
      terms.h2('Your content'),
      terms.p(
        'You keep every right you had in the content you put into Achar. We claim no licence beyond what is needed to store it, serve it to the surfaces you authorize, and back it up. Export is available at any time, in a format that does not require us to interpret.',
      ),
      terms.h2('Acceptable use'),
      ...terms.list([
        'Do not use the service to publish content that is unlawful where you or your readers are.',
        'Do not attempt to reach data belonging to a project you are not a member of.',
        'Do not use the API in a way that degrades it for others; quotas exist, and the plan you are on describes them.',
      ]),
      terms.h2('Availability'),
      terms.p(
        'Paid plans carry the service commitment described on the pricing page. Free plans do not, and are offered as they are. Status history is published, including the incidents we would rather not list.',
      ),
      terms.h2('Ending it'),
      terms.p(
        'You may close your account whenever you like, and you may export first. If we suspend an account for a breach of these terms, we will name the term and give you a chance to put it right — unless doing so would expose somebody else.',
      ),
    ],
  }),

  seedDocument('page-contact', 'page', {
    title: 'Contact',
    slug: 'contact',
    body: [
      contact.p(
        'There is a person at the other end of each of these, and the fastest answer usually comes from picking the right one.',
      ),
      contact.h2('Sales and pricing'),
      contact.p(
        'sales@achar.example — for a plan you cannot buy on the pricing page, a security questionnaire, or a data processing agreement. Tell us roughly what you are modelling and how many editors you have, and the first reply will be more useful.',
      ),
      contact.h2('Support'),
      contact.p(
        'support@achar.example — for anything that is not working. Include the project id, the query or the request, and when it happened; a request id from a response header is the single most useful thing you can paste.',
      ),
      contact.h2('Security'),
      contact.p(
        'security@achar.example — the security page says what we do by default and what a report should contain.',
      ),
      contact.h2('Everything else'),
      contact.p(
        'hello@achar.example reaches a human, if not always the right one immediately. Post goes to the address on the invoices.',
      ),
    ],
  }),

  seedDocument('page-careers', 'page', {
    title: 'Careers',
    slug: 'careers',
    body: [
      careers.p(
        'Achar is a small team building infrastructure for other people\'s content, which is a job with an unusually clear standard: if it loses somebody\'s work it is broken, and nothing else about it matters.',
      ),
      careers.h2('How we work'),
      ...careers.list([
        'Writing is the primary artefact. Designs, decisions and post-mortems are documents, and a document that cannot be read on its own is not finished.',
        'The person who noticed the problem owns it until it is fixed or explained. There is no handoff queue.',
        'We use the product on the product. Every page of this site is a document, so a bug in the studio is a bug we hit while writing about it.',
      ]),
      careers.h2('Open roles'),
      careers.p(
        'There are none listed today. We hire when a specific problem has outgrown the people already here rather than keeping a pipeline warm, so the list is often empty and sometimes has one entry.',
      ),
      careers.p(
        'If you have shipped a content system, a query engine, or a collaborative editor, and you would rather explain your reasoning than your résumé, write to jobs@achar.example and say what you would fix first.',
      ),
    ],
  }),

  seedDocument('page-status', 'page', {
    title: 'Status',
    slug: 'status',
    body: [
      status.p(
        'Every Achar environment is a set of AWS resources in one account, so the honest answer to "is Achar up" is: the API you are calling is up or it is not, and you can ask it.',
      ),
      status.h2('Asking your own deployment'),
      status.p(
        '`GET /v1/info` is the one route that needs no token. It answers with the service name, its version, the stage, the region, and whether the token you sent resolved to a person. A monitor pointed at it tells you more about your environment than any page we could publish.',
      ),
      status.code('curl -s https://your-api.example.com/v1/info'),
      status.h2('Where the failures show up'),
      status.p(
        'A request that reaches a function and fails is a 5xx with an error envelope and a request id. That id is the string to search CloudWatch for, and the console\'s Logs tab searches a stage\'s functions by name and by filter pattern.',
      ),
      ...status.list([
        'A failed deploy is in CloudFormation, and the console reads its events rather than remembering them.',
        'A webhook that could not be delivered is retried five times and then kept in a dead-letter queue, which the console reports on.',
        'A document that will not save is a validation issue, and the studio lists them beside the fields that caused them.',
      ]),
    ],
  }),

  seedDocument('page-sub-processors', 'page', {
    title: 'Sub-processors',
    slug: 'sub-processors',
    body: [
      processors.p(
        'Achar runs on AWS. That is the whole list, with one exception, and both are named here so that the answer does not depend on somebody reading a contract.',
      ),
      processors.h2('Amazon Web Services'),
      processors.p(
        'Everything that holds content runs in AWS, in the account and region a deployment names: DynamoDB for documents and asset metadata, S3 for asset bytes, CloudFront for delivery, Cognito for sign-in, Lambda for the API, CloudWatch for logs. A deployment\'s region is in its own configuration, and this site\'s environment is in us-east-1.',
      ),
      processors.h2('Google'),
      processors.p(
        'Only if the deployment enables it. Google sign-in hands Cognito an email address and a name; no content and no other account data reaches Google. A deployment with no Google client id configured creates no provider at all, which makes this the one sub-processor that can be switched off entirely.',
      ),
      processors.h2('What is not on the list'),
      processors.p(
        'No analytics vendor inside the product. No error-tracking vendor receiving request bodies. The marketing site you are reading has no third-party scripts on it, which is most of why it loads as quickly as it does.',
      ),
      processors.p(
        'Thirty days\' notice of a new sub-processor goes to the billing contact on every paid account.',
      ),
    ],
  }),

  seedDocument('page-docs', 'page', {
    title: 'Read the docs',
    slug: 'docs',
    body: [
      docs.p(
        'There are four things to learn, and they are worth learning in this order. Everything else in the documentation is a variation on one of them.',
      ),
      docs.h2('1. Documents'),
      docs.p(
        'Content is a document: an id, a type, a revision, and whatever fields its schema declares. Documents are not rows. Two documents of the same type need not have the same fields, and a field that is absent is different from a field that is empty — which is why `defined()` is a query operator rather than an afterthought.',
      ),
      docs.h2('2. The schema'),
      docs.p(
        'A schema says what a document of each type may contain. The studio draws its form from it, the API validates against it, and a query may rely on it. Fields are typed, may be required, and may be grouped into tabs; a `reference` names the types it may point at, and an `array` names what its items are.',
      ),
      docs.h2('3. GROQ'),
      docs.code(
        '*[_type == "post" && publishedAt < now()] | order(publishedAt desc) [0...10] { title, "author": author->name }',
      ),
      docs.p(
        'A query has two halves: a filter saying which documents, and a projection saying what comes back. `->` follows a reference, `^` is the parent, `$name` is a parameter, and `|` pipes a result into an ordering, a slice or a projection. [GROQ in twenty minutes](/blog/groq-in-twenty-minutes) is the long version.',
      ),
      docs.h2('4. Drafts and publishing'),
      docs.p(
        'A draft and a published document are two rows whose ids differ by a prefix. Editing writes the draft; publishing moves it onto the published id and deletes the draft. Nothing you type is visible to a reader until somebody publishes, and nothing you publish is lost by continuing to edit.',
      ),
      docs.h2('Reading it from code'),
      docs.p(
        'The typed client is a package, and the demo application in this repository is a working example of using it from outside: paste an API URL and a token, run a query, get documents back. That is the whole integration.',
      ),
    ],
  }),

  seedDocument('page-signup', 'page', {
    title: 'Start building',
    slug: 'signup',
    body: [
      signup.p(
        'A project is a dataset, a schema, and a studio. Making one takes a minute, and the first dataset is seeded with a working content model you can edit rather than an empty screen.',
      ),
      signup.h2('From the console'),
      signup.p(
        'The console in this repository deploys an environment and writes every app\'s configuration to point at it. That is the fastest path from a clone to a studio you can type into.',
      ),
      signup.code('npm install\nnpm run console   # → Backends → dev → Deploy'),
      signup.h2('From the studio'),
      signup.p(
        'Once an environment is up, the studio is where projects and datasets are made. A new dataset starts with Achar\'s own content model — posts, authors, categories, customers, features, plans, questions and integrations — so the first thing you see is a schema you can change rather than a blank page.',
      ),
      signup.h2('Reading it back'),
      ...signup.list([
        'The public site in this repository reads a seed corpus with no backend configured at all, and switches to live content the moment `NEXT_PUBLIC_ACHAR_API_URL` is set.',
        'The demo application is a working third-party client: an API URL, a token, and a query.',
        'The typed client is `@achar/api`, and every method returns the shape declared in `@achar/types`.',
      ]),
      signup.p('No credit card, no sales call, and no plan that expires while you are deciding.'),
    ],
  }),
];
