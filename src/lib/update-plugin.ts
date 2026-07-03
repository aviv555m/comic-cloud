import { registerPlugin } from "@capacitor/core";

export interface UpdatePluginType {
  downloadAndInstall(options: { url: string }): Promise<{ success: boolean }>;
  startBackgroundService(): Promise<{ success: boolean }>;
  stopBackgroundService(): Promise<{ success: boolean }>;
}

export const UpdatePlugin = registerPlugin<UpdatePluginType>("UpdatePlugin");
