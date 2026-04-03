import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { DailySheet, Product, Session, StockEntry } from "../backend";
import { useActor } from "./useActor";

// ─────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────

export function useProducts() {
  const { actor, isFetching } = useActor();
  return useQuery<Product[]>({
    queryKey: ["products"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.getProducts();
    },
    enabled: !!actor && !isFetching,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useClosedDates() {
  const { actor, isFetching } = useActor();
  return useQuery<string[]>({
    queryKey: ["closedDates"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.getClosedDates();
    },
    enabled: !!actor && !isFetching,
  });
}

export function useDailySheet(date: string) {
  const { actor, isFetching } = useActor();
  return useQuery<DailySheet | null>({
    queryKey: ["dailySheet", date],
    queryFn: async () => {
      if (!actor) return null;
      return actor.getDailySheet(date);
    },
    enabled: !!actor && !isFetching && !!date,
  });
}

export function useOpeningStock(date: string) {
  const { actor, isFetching } = useActor();
  return useQuery<StockEntry[]>({
    queryKey: ["openingStock", date],
    queryFn: async () => {
      if (!actor) return [];
      return actor.getOpeningStockForNewDay(date);
    },
    enabled: !!actor && !isFetching && !!date,
  });
}

// ─────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────

export function useSaveSession() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      date,
      session,
    }: { date: string; session: Session }) => {
      if (!actor) throw new Error("Actor not initialized");
      await actor.saveSession(date, session);
    },
    onSuccess: (_data, variables) => {
      toast.success("Session saved successfully");
      queryClient.invalidateQueries({
        queryKey: ["dailySheet", variables.date],
      });
    },
    onError: () => {
      toast.error("Failed to save session");
    },
  });
}

export function useCloseDay() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (date: string) => {
      if (!actor) throw new Error("Actor not initialized");
      await actor.closeDay(date);
    },
    onSuccess: (_data, date) => {
      toast.success("Sheet closed and updated successfully");
      queryClient.invalidateQueries({ queryKey: ["dailySheet", date] });
      queryClient.invalidateQueries({ queryKey: ["closedDates"] });
    },
    onError: () => {
      toast.error("Failed to close sheet");
    },
  });
}

export function useInitializeProducts() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!actor) throw new Error("Actor not initialized");
      await actor.initializeProducts();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}
