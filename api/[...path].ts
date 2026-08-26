import { app, initializeApp } from "./_server.js";

let ready: Promise<void> | undefined;

async function handler(req: any, res: any) {
  ready ??= initializeApp(undefined, false);
  await ready;
  return app(req, res);
}

export default handler;
