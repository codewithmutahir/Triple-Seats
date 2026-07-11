"use client";

import { ClipboardList, Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { TaskPayload } from "@/lib/event-types";

type EventTasksTabProps = {
  tasks: TaskPayload[];
  canWriteTasks: boolean;
  onAddTask: (title: string) => Promise<void>;
  onToggleTask: (task: TaskPayload, done: boolean) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
};

export function EventTasksTab({
  tasks,
  canWriteTasks,
  onAddTask,
  onToggleTask,
  onDeleteTask
}: EventTasksTabProps) {
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [taskSaving, setTaskSaving] = useState(false);

  const pending = tasks.filter((t) => t.status !== "done");
  const completed = tasks.filter((t) => t.status === "done");

  async function addTask() {
    if (!newTaskTitle.trim()) return;
    setTaskSaving(true);
    try {
      await onAddTask(newTaskTitle.trim());
      setNewTaskTitle("");
    } catch {
      toast.error("Failed to add task");
    } finally {
      setTaskSaving(false);
    }
  }

  function TaskList({ items, emptyLabel }: { items: TaskPayload[]; emptyLabel: string }) {
    if (items.length === 0) {
      return (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <ClipboardList className="h-4 w-4" />
          {emptyLabel}
        </p>
      );
    }

    return (
      <ul className="space-y-2">
        {items.map((t) => (
          <li
            key={t.id}
            className="flex items-start gap-2 rounded-md border border-slate-100 bg-slate-50/50 p-2"
          >
            <Checkbox
              className="mt-1"
              checked={t.status === "done"}
              disabled={!canWriteTasks}
              onCheckedChange={(c) => void onToggleTask(t, c === true)}
            />
            <span
              className={cn(
                "flex-1 text-sm",
                t.status === "done" && "text-muted-foreground line-through"
              )}
            >
              {t.title}
            </span>
            {canWriteTasks ? (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0"
                onClick={() => void onDeleteTask(t.id)}
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="space-y-6">
      {canWriteTasks ? (
        <div className="flex gap-2">
          <Input
            placeholder="New task…"
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addTask();
            }}
          />
          <Button type="button" size="icon" variant="secondary" disabled={taskSaving} onClick={() => void addTask()}>
            {taskSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </Button>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Pending</CardTitle>
        </CardHeader>
        <CardContent>
          <TaskList items={pending} emptyLabel="No pending tasks" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Completed</CardTitle>
        </CardHeader>
        <CardContent>
          <TaskList items={completed} emptyLabel="No completed tasks yet" />
        </CardContent>
      </Card>
    </div>
  );
}
