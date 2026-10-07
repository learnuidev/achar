'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ChevronLeftIcon,
  ImageIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  ShapesIcon,
  UsersIcon,
} from 'lucide-react';
import { useViewer } from '@achar/auth';
import { AcharMark, Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Separator, ThemeToggle, cn } from '@achar/ui';
import { iconFor } from '@/lib/icons';
import { routes } from '@/lib/routes';
import { useStudio } from '@/components/studio/studio-context';

/**
 * The rail: everything the studio can be pointed at, in one column.
 *
 * The content types come first and come from the schema, because that list is
 * the app: a dataset authored against a different model has a different rail,
 * and the studio has no idea what a `post` is. The three fixed entries under it
 * are the things that are true of every dataset — its library, its schema, its
 * keys — and Members sits with the project rather than the dataset, since that
 * is where the role that decides all of this lives.
 */
export function StudioRail({ datasets }: { datasets: { datasetName: string }[] }) {
  const { project, dataset, schema, types } = useStudio();
  const pathname = usePathname();
  const router = useRouter();

  const base = routes.dataset(project.projectId, dataset);

  const sections = [
    { href: routes.assets(project.projectId, dataset), label: 'Assets', icon: ImageIcon },
    { href: routes.schema(project.projectId, dataset), label: 'Schema', icon: ShapesIcon },
    { href: routes.api(project.projectId, dataset), label: 'API', icon: KeyRoundIcon },
    { href: routes.members(project.projectId), label: 'Members', icon: UsersIcon },
  ];

  return (
    <nav className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex items-center gap-2 px-3 py-3">
        <Link
          href={routes.project(project.projectId)}
          className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          title="Back to the project"
        >
          <ChevronLeftIcon className="size-4" />
        </Link>
        <AcharMark className="size-6" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{project.name}</p>
          <p className="truncate text-xs text-muted-foreground">{project.slug}</p>
        </div>
      </div>

      <div className="px-3 pb-3">
        {/* Switching dataset is switching everything: the schema, the documents
            and the assets all belong to one, so it is a navigation rather than
            a filter. */}
        <Select
          value={dataset}
          onValueChange={(next) => router.push(routes.dataset(project.projectId, next))}
        >
          <SelectTrigger aria-label="Dataset" className="w-full">
            <SelectValue placeholder="Pick a dataset" />
          </SelectTrigger>
          <SelectContent>
            {datasets.map((candidate) => (
              <SelectItem key={candidate.datasetName} value={candidate.datasetName}>
                {candidate.datasetName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Separator />

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        <RailItem
          href={base}
          label="Overview"
          icon={<LayoutDashboardIcon className="size-4" />}
          active={pathname === base}
        />

        <p className="px-2 pt-4 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Content
        </p>

        {types.length === 0 && (
          <p className="px-2 py-1 text-xs text-muted-foreground">
            This dataset&rsquo;s schema declares no document types yet.
          </p>
        )}

        {types.map((type) => {
          const Icon = iconFor(type.icon);
          const href = routes.content(project.projectId, dataset, type.name);
          return (
            <RailItem
              key={type.name}
              href={href}
              label={type.title || type.name}
              icon={<Icon className="size-4" />}
              active={pathname === href || pathname.startsWith(`${href}/`)}
            />
          );
        })}

        <p className="px-2 pt-4 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          This dataset
        </p>

        {sections.map((section) => (
          <RailItem
            key={section.href}
            href={section.href}
            label={section.label}
            icon={<section.icon className="size-4" />}
            active={pathname === section.href || pathname.startsWith(`${section.href}/`)}
          />
        ))}
      </div>

      <Separator />
      <ViewerFooter types={types.length} schemaRevision={schema.revision} />
    </nav>
  );
}

function RailItem({
  href,
  label,
  icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
        active
          ? 'bg-accent font-medium text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground',
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
    </Link>
  );
}

/** Who is signed in, and the two things they can do about it. */
function ViewerFooter({ types, schemaRevision }: { types: number; schemaRevision: string }) {
  const { viewer, signOut } = useViewer();

  return (
    <div className="space-y-2 px-3 py-3">
      <p className="truncate text-xs text-muted-foreground" title={viewer?.email ?? ''}>
        {viewer?.name || viewer?.email || 'Signed in'}
      </p>
      <p className="truncate text-xs text-muted-foreground">
        {types} {types === 1 ? 'type' : 'types'} · schema {schemaRevision.slice(0, 7)}
      </p>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <Button variant="ghost" size="sm" onClick={() => void signOut()}>
          <LogOutIcon className="size-4" />
          Sign out
        </Button>
      </div>
    </div>
  );
}
