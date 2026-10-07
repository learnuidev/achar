'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AppWindowIcon,
  ArrowLeftIcon,
  BookTextIcon,
  GlobeIcon,
  Loader2Icon,
  NewspaperIcon,
  SparklesIcon,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { slugify } from '@achar/schema';
import type { Viewer } from '@achar/types';
import {
  AcharMark,
  Button,
  Input,
  Label,
  cn,
} from '@achar/ui';
import { SignIn, useViewer } from '@achar/auth';
import { AuthFrame, AuthFrameSkeleton } from '@/components/auth/auth-frame';
import { AcharClientProvider } from '@/components/client-provider';
import { StudioPreview } from '@/components/onboarding/studio-preview';
import { useProfile } from '@/hooks/use-profile';
import { useAction } from '@/hooks/use-resource';
import { getStartedPath, routes } from '@/lib/routes';

/**
 * Getting somebody from an empty account to a project with a dataset in it.
 *
 * Four questions, and each one is asked because an answer goes somewhere: what
 * you are building picks the types the dataset starts with and suggests a project
 * name, the organization is a field on the project the API stores, the project
 * name *is* the project, and the dataset is where documents and assets live. There
 * is no step here that only looks like it is doing something — a questionnaire
 * that ends in a form is a questionnaire nobody finishes twice.
 *
 * The answers live in this component's state and nowhere else. There is no
 * half-finished onboarding to come back to because there is nothing to come back
 * to: two fields the API needs and two that are choices, all four of which can be
 * changed afterwards in the studio, which is where changing things belongs.
 *
 * Reaching it at all means one of two things, and this decides which: somebody
 * with a project has nothing to onboard — they are sent to the studio with the
 * new-project form up, which is the only thing this page could still do for them
 * — and somebody without one is who the page is for. The studio's gate does the
 * same check from the other side; see `auth-gate.tsx`.
 */

/** A starting point: a name, and the document types its dataset begins with. */
interface Building {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  /** The project name this choice suggests, until somebody types their own. */
  project: string;
  /** The content types this starting point suggests — see `studio-preview.tsx`. */
  types: readonly string[];
}

const BUILDINGS: readonly Building[] = [
  {
    id: 'marketing',
    title: 'Marketing site',
    description: 'Pages and posts for a company or a product.',
    icon: GlobeIcon,
    project: 'Website',
    types: ['Page', 'Post'],
  },
  {
    id: 'docs',
    title: 'Documentation',
    description: 'Guides and reference pages that stay in step with the product.',
    icon: BookTextIcon,
    project: 'Product docs',
    types: ['Page'],
  },
  {
    id: 'blog',
    title: 'Blog or newsroom',
    description: 'Articles with authors, categories and covers.',
    icon: NewspaperIcon,
    project: 'Blog',
    types: ['Post', 'Author', 'Category'],
  },
  {
    id: 'product',
    title: 'Product content',
    description: 'Copy and media an app reads through the API.',
    icon: AppWindowIcon,
    project: 'App content',
    types: ['Feature', 'Pricing plan', 'Faq'],
  },
  {
    id: 'other',
    title: 'Something else',
    description: 'Start from the whole default model and drop what you do not want.',
    icon: SparklesIcon,
    project: '',
    types: ['Post', 'Page', 'Customer'],
  },
];

/** How many questions there are, which the progress bar counts. */
const TOTAL_STEPS = 4;

export function OnboardingFlow({ apiUrl }: { apiUrl: string }) {
  const { viewer, loading } = useViewer();

  if (loading) return <AuthFrameSkeleton />;
  if (!viewer) return <SignInStep />;

  return (
    <AcharClientProvider apiUrl={apiUrl}>
      <Flow viewer={viewer} />
    </AcharClientProvider>
  );
}

function Flow({ viewer }: { viewer: Viewer }) {
  const router = useRouter();
  const profile = useProfile();

  const [step, setStep] = useState(1);
  const [building, setBuilding] = useState<Building | null>(null);
  const [organization, setOrganization] = useState('');
  const [projectName, setProjectName] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [datasetName, setDatasetName] = useState('production');

  const createProject = useAction(async (client, input: { name: string; organizationName: string }) =>
    client.createProject(input),
  );
  const createDataset = useAction(async (client, input: { projectId: string; datasetName: string }) =>
    client.createDataset(input.projectId, { datasetName: input.datasetName, visibility: 'PRIVATE' }),
  );

  // Somebody who already has a project is not being onboarded. `replace` rather
  // than `push`: this page is not a step they took, so it should not be a page
  // Back returns them to.
  const hasProject = profile.data !== null && profile.data.projectCount > 0;
  useEffect(() => {
    if (hasProject) router.replace(routes.projectPickerNewProject());
  }, [hasProject, router]);

  const trimmedOrganization = organization.trim();
  const trimmedProject = projectName.trim();
  const datasetSlug = slugify(datasetName);

  // Two characters, which is the same bar `create-project-dialog.tsx` sets. An
  // organization called "A" is one somebody renames in the studio a day later, and
  // the API has no opinion either way — so the form has one.
  const canContinue = trimmedOrganization.length > 1;
  const canCreateProject =
    trimmedProject.length > 1 && trimmedOrganization.length > 1 && !createProject.pending;

  // The wait for the profile is also the wait between deciding to redirect and the
  // route changing, so both draw the same thing.
  if (profile.loading || hasProject) return <AuthFrameSkeleton />;

  function pick(option: Building) {
    // A project name follows the choice until somebody types one. Comparing
    // against the outgoing suggestion is what makes "I picked Blog, then changed
    // my mind" replace "Blog" and a name somebody typed survive.
    const suggested = building?.project ?? '';
    setBuilding(option);
    setProjectName((current) => (current === '' || current === suggested ? option.project : current));
  }

  async function submitProject(event: React.FormEvent) {
    event.preventDefault();
    if (!canCreateProject) return;

    const project = await createProject.run({
      name: trimmedProject,
      organizationName: trimmedOrganization,
    });
    if (!project) return;

    setProjectId(project.projectId);
    setStep(4);
  }

  async function submitDataset(event: React.FormEvent) {
    event.preventDefault();
    if (!projectId || !datasetSlug) return;

    const dataset = await createDataset.run({ projectId, datasetName: datasetSlug });
    if (!dataset) return;

    toast.success(`${dataset.datasetName} is ready`, {
      description: 'Achar’s default content model is in place, so there are already types to author.',
    });
    router.replace(routes.project(projectId));
  }

  // A dataset is not required to have a project, so leaving without one is a
  // choice rather than a failure: the project page asks for it as its first
  // action, and asking twice in a row is how a flow feels like a form.
  function skipDataset() {
    if (projectId) router.replace(routes.project(projectId));
  }

  const note = createProject.pending
    ? 'Creating project…'
    : createDataset.pending
      ? 'Creating dataset…'
      : null;

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <OnboardingBar viewer={viewer} note={note} />

      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-6 py-10 lg:grid-cols-2 lg:gap-16">
        <section className="w-full max-w-md">
          <Answered building={building} organization={trimmedOrganization} project={trimmedProject} step={step} />

          {step === 1 && (
            <>
              <Question
                title="What are you building?"
                subtitle="This picks the project name below, and which content types are worth making first. You write them in the studio — from a sample of your data, if you have one."
              />
              <div className="mt-6 grid gap-2 sm:grid-cols-2">
                {BUILDINGS.map((option) => {
                  const Icon = option.icon;
                  const selected = building?.id === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => pick(option)}
                      className={cn(
                        'flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors',
                        selected ? 'border-primary bg-accent' : 'border-border hover:bg-accent/50',
                      )}
                    >
                      <Icon className="size-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{option.title}</span>
                      <span className="text-xs text-muted-foreground">{option.description}</span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-6">
                <Button type="button" onClick={() => setStep(2)} disabled={!building}>
                  Continue
                </Button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <Question
                title="What is your organization called?"
                subtitle="Who the project belongs to on paper — a company, a client, or just you."
              />
              <form
                className="mt-6 grid gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (canContinue) setStep(3);
                }}
              >
                <Label htmlFor="onboarding-organization">Organization</Label>
                <Input
                  id="onboarding-organization"
                  value={organization}
                  onChange={(event) => setOrganization(event.target.value)}
                  placeholder="Acme Inc."
                  autoComplete="organization"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  Nothing about access follows from it: who may read and write this project is its
                  roster and their roles.
                </p>
                <div className="mt-4 flex items-center gap-2">
                  <Button type="submit" disabled={!canContinue}>
                    Continue
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setStep(1)}>
                    <ArrowLeftIcon />
                    Back
                  </Button>
                </div>
              </form>
            </>
          )}

          {step === 3 && (
            <>
              <Question title="What is your project called?" subtitle="You can always change this later." />
              <form className="mt-6 grid gap-2" onSubmit={submitProject}>
                <Label htmlFor="onboarding-project">Project</Label>
                <Input
                  id="onboarding-project"
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                  placeholder="Acme Content"
                  autoComplete="off"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  A project owns datasets and people, and you become its admin.
                </p>
                <ErrorLine message={createProject.error} />
                <div className="mt-4 flex items-center gap-2">
                  <Button type="submit" disabled={!canCreateProject}>
                    {createProject.pending && <Loader2Icon className="animate-spin" />}
                    Create project
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setStep(2)}
                    disabled={createProject.pending}
                  >
                    <ArrowLeftIcon />
                    Back
                  </Button>
                </div>
              </form>
            </>
          )}

          {step === 4 && (
            <>
              <Question
                title="Name your first dataset"
                subtitle="Documents and assets live in a dataset, and a project can hold several — staging and production are two of them rather than one with a flag."
              />
              <form className="mt-6 grid gap-2" onSubmit={submitDataset}>
                <Label htmlFor="onboarding-dataset">Dataset</Label>
                <Input
                  id="onboarding-dataset"
                  value={datasetName}
                  onChange={(event) => setDatasetName(event.target.value)}
                  placeholder="production"
                  autoComplete="off"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  Stored as <span className="font-mono">{datasetSlug || 'production'}</span> — the word
                  every query in your code will use.
                </p>
                <ErrorLine message={createDataset.error} />
                <div className="mt-4 flex items-center gap-2">
                  <Button type="submit" disabled={!datasetSlug || createDataset.pending}>
                    {createDataset.pending && <Loader2Icon className="animate-spin" />}
                    Create dataset
                  </Button>
                  <Button type="button" variant="ghost" onClick={skipDataset} disabled={createDataset.pending}>
                    Skip for now
                  </Button>
                </div>
              </form>
            </>
          )}
        </section>

        <section className="w-full">
          <StudioPreview
            organization={trimmedOrganization}
            projectName={trimmedProject}
            dataset={step >= 4 ? datasetSlug : null}
            types={building?.types ?? []}
          />
        </section>
      </main>

      <Progress step={step} />
    </div>
  );
}

/** The question being asked, in the one place that decides how it reads. */
function Question({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}

/**
 * What has been answered, above the question that has not.
 *
 * It is the design's answer as much as the screen's: a person three questions in
 * wants to see what they said without scrolling back, and a summary that is
 * *text* rather than a stack of dead form controls is one they can read at a
 * glance. The Back button is how an answer is changed — the summary is a record of
 * what was said, not a set of fields.
 */
function Answered({
  building,
  organization,
  project,
  step,
}: {
  building: Building | null;
  organization: string;
  project: string;
  step: number;
}) {
  const answered: { question: string; answer: string }[] = [];
  if (step > 1 && building) answered.push({ question: 'Building', answer: building.title });
  if (step > 2 && organization) answered.push({ question: 'Organization', answer: organization });
  if (step > 3 && project) answered.push({ question: 'Project', answer: project });

  if (answered.length === 0) return null;

  return (
    <ul className="mb-8 space-y-1">
      {answered.map((row) => (
        <li key={row.question} className="text-sm text-muted-foreground">
          {row.question} <span className="text-foreground">{row.answer}</span>
        </li>
      ))}
    </ul>
  );
}

/** A failure from the API, in the API's own words. */
function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="text-sm text-destructive">{message}</p>;
}

/** The bar: the product's mark, who is signed in, and what is being made. */
function OnboardingBar({ viewer, note }: { viewer: Viewer; note: string | null }) {
  const name = viewer.name?.trim() || viewer.email;
  const initials = name.slice(0, 2).toUpperCase();

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border/50 px-6">
      <AcharMark className="h-8" />

      <div className="flex items-center gap-3">
        {note && (
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2Icon className="size-3.5 animate-spin" />
            {note}
          </span>
        )}
        <span className="hidden text-right text-xs leading-tight text-muted-foreground sm:block">
          Logged in as
          <br />
          <span className="text-foreground">{name}</span>
        </span>
        {/* Initials rather than a picture: there is no avatar to read, and a
            silhouette beside a name reads as a broken image. */}
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground"
        >
          {initials}
        </span>
      </div>
    </header>
  );
}

/** How far in this is, in the design's own terms. */
function Progress({ step }: { step: number }) {
  return (
    <footer className="mx-auto flex w-full max-w-6xl shrink-0 items-center gap-4 px-6 pb-8">
      <span className="text-xs text-muted-foreground">
        Step {step} of {TOTAL_STEPS}
      </span>
      <span
        role="progressbar"
        aria-label="Onboarding progress"
        aria-valuemin={1}
        aria-valuemax={TOTAL_STEPS}
        aria-valuenow={step}
        className="flex gap-1.5"
      >
        {Array.from({ length: TOTAL_STEPS }, (_, index) => (
          <span
            key={index}
            className={cn('h-1 w-10 rounded-full', index < step ? 'bg-primary' : 'bg-border')}
          />
        ))}
      </span>
    </footer>
  );
}

/**
 * Somebody who reached this URL without an account.
 *
 * The flow is four questions about a project that will belong to them, so it needs
 * a *them* first. The form is the auth package's own, in the same frame every other
 * account screen wears — the flow's whole business is the four questions, so this
 * screen is the studio's sign-in with different words on it rather than a third
 * place a form lives. Signing in comes back to this page rather than to the studio,
 * because the studio is the screen that would send somebody with nothing to open
 * straight back here.
 */
function SignInStep() {
  return (
    <AuthFrame
      title="Sign in to get started"
      description="Four questions, and your project is ready to author against."
      footer={
        <>
          No account yet?{' '}
          <Link href="/sign-up" className="underline">
            Create one
          </Link>
        </>
      }
    >
      <SignIn redirectTo={getStartedPath} />
    </AuthFrame>
  );
}
