import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { usePermissions } from "@/hooks/use-permissions";
import { api } from "@/lib/api";
import { denyMutation, handleMutationError } from "@/lib/mutation-guard";
import { queryKeys } from "@/lib/query-keys";
import type { TaskItem, TasksStats } from "@/lib/stores/app-store";

const ALL_TASKS_KEY = queryKeys.tasks.listAll();

export function useTasksQuery() {
  const listQuery = useQuery({
    queryKey: ALL_TASKS_KEY,
    queryFn: api.tasks.listAll,
    staleTime: 60 * 1000
  });

  const statsQuery = useQuery({
    queryKey: queryKeys.tasks.stats(),
    queryFn: api.tasks.stats,
    staleTime: 60 * 1000
  });

  return { listQuery, statsQuery };
}

export function useTaskMutations() {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canWrite = can("tasks:write");

  const addMutation = useMutation({
    mutationFn: (data: { title: string; eventId?: string | null }) =>
      api.tasks.create(data).then((r) => r.task),
    onMutate: async (newTask) => {
      if (!canWrite) return denyMutation();
      await qc.cancelQueries({ queryKey: ALL_TASKS_KEY });
      const prev = qc.getQueryData<TaskItem[]>(ALL_TASKS_KEY);
      const optimistic: TaskItem = {
        id: `temp_${Date.now()}`,
        title: newTask.title,
        status: "pending",
        createdAt: new Date().toISOString(),
        event: null
      };
      qc.setQueryData<TaskItem[]>(ALL_TASKS_KEY, (old = []) => [optimistic, ...old]);
      return { prev, tempId: optimistic.id };
    },
    onSuccess: (created, _vars, ctx) => {
      qc.setQueryData<TaskItem[]>(ALL_TASKS_KEY, (old = []) =>
        old.map((t) => (t.id === ctx?.tempId ? created : t))
      );
      void qc.invalidateQueries({ queryKey: queryKeys.tasks.stats() });
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(ALL_TASKS_KEY, ctx.prev);
      handleMutationError(err, ctx, "Failed to add task");
    }
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskItem["status"] }) =>
      api.tasks.update(id, { status }).then((r) => r.task),
    onMutate: async ({ id, status }) => {
      if (!canWrite) return denyMutation();
      const prev = qc.getQueryData<TaskItem[]>(ALL_TASKS_KEY);
      qc.setQueryData<TaskItem[]>(ALL_TASKS_KEY, (old = []) =>
        old.map((t) => (t.id === id ? { ...t, status } : t))
      );
      return { prev };
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.tasks.stats() }),
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(ALL_TASKS_KEY, ctx.prev);
      handleMutationError(err, ctx, "Failed to update task");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.tasks.delete(id),
    onMutate: async (id) => {
      if (!canWrite) return denyMutation();
      const prev = qc.getQueryData<TaskItem[]>(ALL_TASKS_KEY);
      qc.setQueryData<TaskItem[]>(ALL_TASKS_KEY, (old = []) => old.filter((t) => t.id !== id));
      return { prev };
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.tasks.stats() }),
    onError: (err, id, ctx) => {
      if (ctx?.prev) qc.setQueryData(ALL_TASKS_KEY, ctx.prev);
      handleMutationError(err, ctx, "Failed to delete task");
    }
  });

  return { addMutation, toggleMutation, deleteMutation, canWriteTasks: canWrite };
}

export type { TasksStats };
