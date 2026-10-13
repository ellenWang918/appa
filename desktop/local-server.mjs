import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createChatgptService, equalSecret } from "../server/chatgpt.mjs";

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".ico": "image/x-icon",
};
const csp =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

export async function startLocalApp({
  staticRoot,
  dataRoot,
  deviceSecret,
  requestFetch,
}) {
  if (typeof deviceSecret !== "string" || deviceSecret.length < 32)
    throw new Error("A private desktop session is required.");
  await mkdir(dataRoot, { recursive: true });
  const configuration = path.join(dataRoot, "desktop.json");
  let savedPort = 0;
  try {
    const saved = JSON.parse(await readFile(configuration, "utf8"));
    if (
      !Number.isInteger(saved.port) ||
      saved.port < 1024 ||
      saved.port > 65535
    )
      throw new Error("invalid port");
    savedPort = saved.port;
  } catch (error) {
    if (error.code !== "ENOENT")
      throw new Error(
        "The desktop settings could not be read. Your calendar has been preserved. See the recovery guide.",
      );
  }
  // Native OAuth returns from the user's system browser, which does not share
  // Electron's cookie jar. State, nonce and S256 PKCE bind that callback instead.
  const ai = createChatgptService({
    requireCallbackCookie: false,
    requestFetch,
  });
  await ai.initialize(path.join(dataRoot, "connection"));
  const root = path.resolve(staticRoot);
  let origin;
  const server = createServer(async (req, res) => {
    try {
      const cookie = req.headers.cookie
        ?.split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith("calendar-device="))
        ?.slice(16);
      if (
        `http://${req.headers.host}` !== origin ||
        !equalSecret(cookie, deviceSecret) ||
        (req.headers.origin && req.headers.origin !== origin)
      ) {
        res.writeHead(403, {
          "Content-Type": "text/plain",
          "Cache-Control": "no-store",
        });
        return res.end("This private app session is unavailable.");
      }
      if (req.url.startsWith("/api/"))
        return await ai.handle(req, res, () => {
          res.writeHead(404);
          res.end();
        });
      if (!["GET", "HEAD"].includes(req.method)) {
        res.writeHead(405);
        return res.end();
      }
      const pathname = decodeURIComponent(new URL(req.url, origin).pathname);
      if (pathname !== "/" && !pathname.startsWith("/assets/")) {
        res.writeHead(404);
        return res.end();
      }
      const target = path.resolve(
        root,
        pathname === "/" ? "index.html" : "." + pathname,
      );
      if (!target.startsWith(root + path.sep) || pathname.includes("\0")) {
        res.writeHead(404);
        return res.end();
      }
      const content = await readFile(target);
      res.writeHead(200, {
        "Content-Type":
          types[path.extname(target)] || "application/octet-stream",
        "Content-Length": content.length,
        "Content-Security-Policy": csp,
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "Cache-Control": "no-store",
      });
      res.end(req.method === "HEAD" ? undefined : content);
    } catch (error) {
      if (!res.headersSent) res.writeHead(error.code === "ENOENT" ? 404 : 500);
      res.end("The local app could not complete this request.");
    }
  });
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(savedPort, "127.0.0.1", resolve);
    });
    const port = server.address().port;
    origin = `http://127.0.0.1:${port}`;
    if (!savedPort)
      await writeFile(configuration, JSON.stringify({ port }), {
        mode: 0o600,
        flag: "wx",
      });
  } catch (error) {
    ai.close();
    server.close();
    throw new Error(
      error.code === "EADDRINUSE"
        ? "Another application is using this calendar's saved local address. Close it and reopen AI Goal Calendar. Your saved goals have been preserved."
        : "The local calendar could not start. Check access to its application data folder.",
    );
  }
  return {
    origin,
    close() {
      ai.close();
      server.closeAllConnections();
      return new Promise((resolve) => server.close(resolve));
    },
  };
}
