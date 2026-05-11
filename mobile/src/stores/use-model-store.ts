import { create } from 'zustand';

interface ModelState {
  activeRoute: 'auto' | 'cloud' | 'deepseek';
  activeModel: string;
  cloudAgentOnline: boolean;
  circuitState: 'closed' | 'open' | 'half_open';
  setRoute: (route: 'auto' | 'cloud' | 'deepseek') => void;
  setActiveModel: (name: string) => void;
  setCloudAgentOnline: (online: boolean) => void;
  setCircuitState: (state: 'closed' | 'open' | 'half_open') => void;
}

export const useModelStore = create<ModelState>((set) => ({
  activeRoute: 'auto', activeModel: 'Kimi kimi2.6 (Cloud)', cloudAgentOnline: false, circuitState: 'closed',
  setRoute: (route) => set({ activeRoute: route }),
  setActiveModel: (name) => set({ activeModel: name }),
  setCloudAgentOnline: (online) => set({ cloudAgentOnline: online }),
  setCircuitState: (state) => set({ circuitState: state }),
}));
