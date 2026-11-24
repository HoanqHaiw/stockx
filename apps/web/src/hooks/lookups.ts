import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { MaterialGroup, Unit, Warehouse } from '../lib/types';

export const useUnits = () =>
  useQuery({ queryKey: ['master', 'units'], queryFn: () => api<Unit[]>('/master/units'), staleTime: 5 * 60_000 });

export const useGroups = () =>
  useQuery({
    queryKey: ['master', 'groups'],
    queryFn: () => api<MaterialGroup[]>('/master/material-groups'),
    staleTime: 5 * 60_000,
  });

export const useWarehouses = (all = false) =>
  useQuery({
    queryKey: ['master', 'warehouses', all],
    queryFn: () => api<Warehouse[]>(`/master/warehouses${all ? '?active=all' : ''}`),
  });
