import { ElectronAPI } from '../electron/preload';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
