import { StudioShell } from '@/components/studio/studio-shell';

/**
 * A dataset's screens, inside the studio's frame.
 *
 * The frame is a layout rather than something each page wraps itself in because
 * the three reads it makes — the project, the schema, the asset library — are
 * the same three for every screen under here, and a page that fetched its own
 * schema could disagree with the rail beside it about which types exist.
 *
 * `params` is a promise in Next 16, so this is an async component: the ids are
 * settled before the client shell mounts, which is what lets the shell issue its
 * first request immediately rather than after a render it could not use.
 */
export default async function DatasetLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string; dataset: string }>;
}) {
  const { projectId, dataset } = await params;

  return (
    <StudioShell projectId={projectId} dataset={dataset}>
      {children}
    </StudioShell>
  );
}
