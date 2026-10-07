'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Dataset, DatasetSchema, Project, SchemaType } from '@achar/types';
import { canAdmin, canEdit } from '@/lib/roles';

/**
 * What every screen inside a dataset already knows.
 *
 * The project, the dataset and the schema are read once by the shell and handed
 * down, because every surface below them is downstream of all three: the rail's
 * list of types is the schema's document types, the editor's controls are the
 * schema's fields, and whether a button is drawn at all is the caller's role on
 * the project. A screen that fetched its own copy of the schema could disagree
 * with the rail beside it about which types exist.
 */
export interface StudioContextValue {
  project: Project;
  projectId: string;
  dataset: string;
  /** The dataset's own row, when the shell was able to read it. */
  datasetInfo: Dataset | null;
  schema: DatasetSchema;
  /** The types a person can list — the documents, not the objects. */
  types: SchemaType[];
  /**
   * Re-read the schema, after something wrote one.
   *
   * Every screen under here is drawn from `schema`, including the rail, so a
   * screen that saves a schema has to say so or it will keep drawing the types it
   * was opened with — a type editor that appears to have done nothing.
   */
  refreshSchema: () => void;
  /** The caller may write content here. */
  canEdit: boolean;
  /** The caller may manage the project and its people. */
  canAdmin: boolean;
}

const StudioContext = createContext<StudioContextValue | null>(null);

export function StudioProvider({
  project,
  dataset,
  datasetInfo,
  schema,
  types,
  refreshSchema,
  children,
}: {
  project: Project;
  dataset: string;
  datasetInfo?: Dataset | null;
  schema: DatasetSchema;
  types: SchemaType[];
  refreshSchema: () => void;
  children: ReactNode;
}) {
  const value = useMemo<StudioContextValue>(
    () => ({
      project,
      projectId: project.projectId,
      dataset,
      datasetInfo: datasetInfo ?? null,
      schema,
      types,
      refreshSchema,
      canEdit: canEdit(project.role),
      canAdmin: canAdmin(project.role),
    }),
    [project, dataset, datasetInfo, schema, types, refreshSchema],
  );

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudio(): StudioContextValue {
  const value = useContext(StudioContext);
  if (!value) {
    throw new Error('useStudio must be used inside the studio shell');
  }
  return value;
}
