import { useQuery } from '@tanstack/react-query';
import { api, request } from '../../../shared/api/client';

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => request(() => api.GET('/api/v1/health', { signal })),
  });
}
