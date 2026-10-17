// Local stream mode: holds Spectrum's long-lived connection instead of receiving webhooks.
// No public URL, Vercel, or Supabase needed — handy for testing the agent from a laptop.
// Don't run this while the webhook deployment is live, or both will answer each message.
try { process.loadEnvFile(".env"); } catch {}

const { spectrumApp } = await import("./photon/app.js");
const { handleMessage } = await import("./agent/handle.js");

const app = await spectrumApp();
console.log("zerkabill listening on the iMessage stream (ctrl+c to stop)");

const stop = async () => {
  await app.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

for await (const [space, message] of app.messages) {
  if (message.direction === "outbound") continue;
  console.log(`← ${message.sender?.id ?? "?"}: ${message.content.type === "text" ? message.content.text : `[${message.content.type}]`}`);
  handleMessage(space, message).catch((err) => console.error("[listen] handler failed", err));
}

export {};
