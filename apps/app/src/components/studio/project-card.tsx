'use client';

import Link from 'next/link';
import { DatabaseIcon, UsersIcon } from 'lucide-react';
import type { Project } from '@achar/types';
import { Card, CardContent, cn } from '@achar/ui';
import { RoleBadge } from '@/components/studio/badges';
import { formatDate } from '@/lib/format';
import { routes } from '@/lib/routes';

/**
 * One project, as the thing you click to get in.
 *
 * The three numbers on it are the three questions somebody asks before opening
 * one: how much is in it, who else is in it, and what may I do here. The last is
 * a badge rather than a hidden decision, because a viewer who opens a project
 * expecting to edit and finds every button greyed out has been misled by the
 * card rather than by the project.
 */
export function ProjectCard({ project }: { project: Project }) {
  return (
    <Link href={routes.project(project.projectId)} className="group block">
      <Card
        className={cn(
          'h-full transition-colors',
          'group-hover:border-ring/60 group-hover:bg-accent/40',
        )}
      >
        <CardContent className="flex h-full flex-col gap-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-base font-medium text-foreground">{project.name}</p>
              <p className="truncate font-mono text-xs text-muted-foreground">{project.slug}</p>
            </div>
            <RoleBadge role={project.role} />
          </div>

          <div className="mt-auto flex items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <DatabaseIcon className="size-3.5" />
              {project.datasetCount} {project.datasetCount === 1 ? 'dataset' : 'datasets'}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <UsersIcon className="size-3.5" />
              {project.memberCount} {project.memberCount === 1 ? 'member' : 'members'}
            </span>
          </div>

          {/* The organization is the heading this card sits under, so it is not
              repeated on the card — see the picker's `groupByOrganization`. */}
          <p className="text-xs text-muted-foreground">Created {formatDate(project.createdAt)}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
