import { create } from 'zustand';

interface Device {
  id: string;
  name: string;
  platform: string;
  status: string;
  lastHeartbeat: number;
  authorizedDirs: string[];
}

interface DeviceState {
  devices: Device[];
  cloudAgent: { status: string; uptime: number } | null;
  fetchDevices: () => Promise<void>;
  fetchCloudAgentHealth: () => Promise<void>;
}

export const useDeviceStore = create<DeviceState>((set) => ({
  devices: [],
  cloudAgent: null,

  fetchDevices: async () => {
    try {
      const { getHttpClient } = require('../services/http-client');
      const res: any = await getHttpClient().get('/api/v1/devices');
      set({ devices: res.devices || [] });
    } catch {}
  },

  fetchCloudAgentHealth: async () => {
    try {
      const { getHttpClient } = require('../services/http-client');
      const res: any = await getHttpClient().get('/health');
      set({ cloudAgent: { status: res.status, uptime: res.uptime } });
    } catch {
      set({ cloudAgent: null });
    }
  },
}));
