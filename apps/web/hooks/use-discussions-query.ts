import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { usePermissions } from "@/hooks/use-permissions";
import { api } from "@/lib/api";
import { denyMutation, handleMutationError } from "@/lib/mutation-guard";
import { quoteAnalytics } from "@/lib/quote-analytics";
import { queryKeys } from "@/lib/query-keys";
import type { Conversation, DiscussionThread } from "@/lib/stores/app-store";

const ALL_CONVERSATIONS_KEY = queryKeys.messages.conversationsAll();

export function useDiscussionsQuery() {
  return useQuery({
    queryKey: ALL_CONVERSATIONS_KEY,
    queryFn: api.messages.conversationsAll,
    staleTime: 60 * 1000
  });
}

export function useDiscussionThreadQuery(eventId: string | null) {
  return useQuery({
    queryKey: queryKeys.messages.thread(eventId ?? ""),
    queryFn: () => api.messages.thread(eventId!),
    enabled: Boolean(eventId),
    staleTime: 60 * 1000
  });
}

export function useDiscussionMutations(eventId: string | null) {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canWrite = can("discussions:write");
  const threadKey = queryKeys.messages.thread(eventId ?? "");

  const sendMutation = useMutation({
    mutationFn: (data: { body: string; sendAsEmail?: boolean; direction?: string }) =>
      api.messages.send({ ...data, eventId }),
    onMutate: () => {
      if (!canWrite) return denyMutation();
    },
    onSuccess: (result, variables) => {
      if (eventId) {
        quoteAnalytics.messageSent({
          eventId,
          direction: variables.direction,
          asEmail: variables.sendAsEmail
        });
      }
      qc.setQueryData<DiscussionThread>(threadKey, (old) =>
        old
          ? { ...old, messages: [...old.messages, result.message] }
          : old
      );
      qc.setQueryData<Conversation[]>(ALL_CONVERSATIONS_KEY, (old = []) => {
        if (!eventId) return old;
        return old.map((c) =>
          c.eventId === eventId
            ? {
                ...c,
                lastMessage: result.message.body,
                lastMessageAt: result.message.createdAt
              }
            : c
        );
      });
    },
    onError: (err, _vars, ctx) => handleMutationError(err, ctx, "Failed to send message")
  });

  return { sendMutation, canWriteDiscussions: canWrite };
}
