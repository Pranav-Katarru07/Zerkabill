import { handle } from "hono/vercel";
import app from "../src/server.js";

const handler = handle(app);

export const GET = handler;
export const POST = handler;
