'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { Id, ProjectQuery, TaskQuery, ThoughtQuery } from '@/domain/entities';
import { DomainError, isDomainError, MESSAGES } from '@/domain/errors';
import { useRepo } from '@/components/shell/WorkspaceProvider';
import { useToast } from '@/components/ui/Toasts';
import { listAllTasks, listAllThoughts, type WorkspaceRepository } from './repository';

export const queryKeys = {
  context: ['context'] as const,
  tasks: (query: TaskQuery) => ['tasks', query] as const,
  task: (id: Id) => ['task', id] as const,
  projects: (query: ProjectQuery) => ['projects', query] as const,
  project: (id: Id) => ['project', id] as const,
  thoughts: (query: ThoughtQuery) => ['thoughts', query] as const,
};

export function useWorkspaceContext() {
  const repo = useRepo();
  return useQuery({ queryKey: queryKeys.context, queryFn: () => repo.getContext() });
}

/** Complete matching set (all pages); `totalMatching` is the count before any preview slicing. */
export function useTasks(query: TaskQuery, enabled = true) {
  const repo = useRepo();
  return useQuery({ queryKey: queryKeys.tasks(query), queryFn: () => listAllTasks(repo, query), enabled });
}

export function useTask(id: Id | null) {
  const repo = useRepo();
  return useQuery({
    queryKey: queryKeys.task(id ?? 'none'),
    queryFn: () => repo.getTask(id!),
    enabled: Boolean(id),
    // An open editor must not be replaced by background refetches.
    refetchInterval: false,
    refetchOnWindowFocus: false,
  });
}

export function useProjects(query: ProjectQuery = {}) {
  const repo = useRepo();
  return useQuery({ queryKey: queryKeys.projects(query), queryFn: () => repo.listProjects(query) });
}

export function useProject(id: Id) {
  const repo = useRepo();
  return useQuery({ queryKey: queryKeys.project(id), queryFn: () => repo.getProject(id), retry: false });
}

export function useThoughts(query: ThoughtQuery) {
  const repo = useRepo();
  return useQuery({ queryKey: queryKeys.thoughts(query), queryFn: () => listAllThoughts(repo, query) });
}

export function errorMessage(error: unknown): string {
  if (isDomainError(error)) return error.message;
  return MESSAGES.unexpected;
}

export interface RunOptions<T> {
  /** Toast after confirmed persistence. */
  success?: string;
  /** Builds the inverse mutation from the confirmed result. */
  undo?: (result: T, repo: WorkspaceRepository) => (() => Promise<unknown>) | null;
  /** When true, errors are rethrown for inline handling instead of toasted. */
  inlineErrors?: boolean;
}

/**
 * Runs a mutation, refreshes every affected view after success and announces only
 * actual results. Undo is a new versioned inverse mutation, never a snapshot restore.
 */
export function useMutationRunner() {
  const repo = useRepo();
  const queryClient = useQueryClient();
  const toast = useToast();

  return useCallback(
    async <T,>(mutation: (repo: WorkspaceRepository) => Promise<T>, options: RunOptions<T> = {}): Promise<T> => {
      try {
        const result = await mutation(repo);
        await queryClient.invalidateQueries();
        if (options.success) {
          const undo = options.undo?.(result, repo) ?? null;
          toast({
            message: options.success,
            action: undo
              ? {
                  label: 'Fortryd',
                  onClick: () => {
                    undo()
                      .then(() => {
                        toast({ message: 'Fortrudt.' });
                      })
                      .catch((error: unknown) => {
                        const message =
                          error instanceof DomainError && error.code === 'VERSION_CONFLICT'
                            ? 'Kan ikke fortrydes – den er ændret siden.'
                            : errorMessage(error);
                        toast({ message, tone: 'error' });
                      })
                      .finally(() => void queryClient.invalidateQueries());
                  },
                }
              : undefined,
          });
        }
        return result;
      } catch (error) {
        if (options.inlineErrors) throw error;
        toast({ message: errorMessage(error), tone: 'error' });
        if (isDomainError(error) && error.code === 'VERSION_CONFLICT') void queryClient.invalidateQueries();
        throw error;
      }
    },
    [repo, queryClient, toast],
  );
}
