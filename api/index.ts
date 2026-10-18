import { handle } from "hono/vercel";
// Built by `npm run build` (scripts/build.mjs) before Vercel traces this function.
// @ts-ignore — generated file, not part of the typechecked sources
import app from "../dist/app.js";

const handler = handle(app);

export const GET = handler;
export const POST = handler;
