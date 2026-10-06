import { QueryClient } from '@tanstack/react-query';

// Authenticated data stays in process memory only; nothing is persisted to disk.
export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, gcTime: 120_000, refetchOnWindowFocus: true } }
});
