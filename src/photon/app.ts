import { Spectrum } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { env } from "../config.js";

type SpectrumApp = Awaited<ReturnType<typeof createApp>>;

function createApp() {
  const e = env();
  return Spectrum({
    projectId: e.PHOTON_PROJECT_ID,
    projectSecret: e.PHOTON_PROJECT_SECRET,
    providers: [imessage.config()],
    webhookSecret: e.SPECTRUM_WEBHOOK_SECRET,
  });
}

let appPromise: Promise<SpectrumApp> | undefined;

/** One Spectrum instance per warm function, reused across requests. */
export function spectrumApp(): Promise<SpectrumApp> {
  if (!appPromise) {
    appPromise = createApp().catch((err) => {
      appPromise = undefined; // let the next request retry a failed init
      throw err;
    });
  }
  return appPromise;
}
