import { ComponentType } from 'react';
import { useCurrentView } from '../store/common/branch/branch.store';
import { PageKey, pageRegistry } from '../constants/page-registry.constant';

export function useResolvedComponent<K extends PageKey>(key: K) {
  const view = useCurrentView();
  return pageRegistry[key][view] as ComponentType<any>; 
}