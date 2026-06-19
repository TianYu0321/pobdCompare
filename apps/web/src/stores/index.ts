import { create } from 'zustand';
import type { NormalizedBuild, BuildDiffResult, BuildTab, ViewMode } from '@/types';

interface BuildStore {
  buildA: NormalizedBuild | null;
  buildB: NormalizedBuild | null;
  setBuildA: (build: NormalizedBuild | null) => void;
  setBuildB: (build: NormalizedBuild | null) => void;
  swapBuilds: () => void;
  clearBuilds: () => void;
}

export const useBuildStore = create<BuildStore>((set) => ({
  buildA: null,
  buildB: null,
  setBuildA: (build) => set({ buildA: build }),
  setBuildB: (build) => set({ buildB: build }),
  swapBuilds: () => set((state) => ({ buildA: state.buildB, buildB: state.buildA })),
  clearBuilds: () => set({ buildA: null, buildB: null }),
}));

interface DiffStore {
  diffResult: BuildDiffResult | null;
  isLoading: boolean;
  error: string | null;
  setDiffResult: (result: BuildDiffResult | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useDiffStore = create<DiffStore>((set) => ({
  diffResult: null,
  isLoading: false,
  error: null,
  setDiffResult: (result) => set({ diffResult: result, error: null }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error, isLoading: false }),
}));

interface UIStore {
  activeTabA: BuildTab;
  activeTabB: BuildTab;
  viewMode: ViewMode;
  showDrawer: boolean;
  setActiveTabA: (tab: BuildTab) => void;
  setActiveTabB: (tab: BuildTab) => void;
  setViewMode: (mode: ViewMode) => void;
  toggleDrawer: () => void;
  setShowDrawer: (show: boolean) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  activeTabA: 'overview',
  activeTabB: 'overview',
  viewMode: 'offense',
  showDrawer: false,
  setActiveTabA: (tab) => set({ activeTabA: tab }),
  setActiveTabB: (tab) => set({ activeTabB: tab }),
  setViewMode: (mode) => set({ viewMode: mode }),
  toggleDrawer: () => set((state) => ({ showDrawer: !state.showDrawer })),
  setShowDrawer: (show) => set({ showDrawer: show }),
}));
