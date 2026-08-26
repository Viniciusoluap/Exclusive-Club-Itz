import { app, initializeApp } from "../server/_core/index";

let ready: Promise<void> | undefined;

async function handler(req: any, res: any) {
  ready ??= initializeApp(undefined, false);
  await ready;
  return app(req, res);
}

export default handler;
