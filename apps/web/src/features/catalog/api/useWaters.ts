import type { Region, WaterStatus, WaterType } from '@lowisko/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, request } from '../../../shared/api/client';
import type { components } from '../../../shared/api/schema';

export type WaterSummary = components['schemas']['WaterSummaryDto'];
export type WaterDetail = components['schemas']['WaterDetailDto'];

export interface WaterQuery {
  region?: Region;
  type?: WaterType;
  status?: WaterStatus;
  q?: string;
  bbox?: string;
}

/** Catalogue for the map and the list; the previous result stays on screen while the map moves. */
export function useWaters(query: WaterQuery, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    enabled,
    queryKey: ['waters', query],
    queryFn: ({ signal }) =>
      request(() => api.GET('/api/v1/waters', { params: { query }, signal })),
    placeholderData: keepPreviousData,
  });
}

export function useWater(id: string) {
  return useQuery({
    queryKey: ['waters', id],
    queryFn: ({ signal }) =>
      request(() => api.GET('/api/v1/waters/{id}', { params: { path: { id } }, signal })),
  });
}
