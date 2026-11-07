import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.yummy.recipes",
  appName: "Yummy",
  webDir: "dist",
  android: {
    backgroundColor: "#FFF8F2",
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: true,
  },
  plugins: {
    CapacitorHttp: { enabled: true },
  },
};

export default config;
