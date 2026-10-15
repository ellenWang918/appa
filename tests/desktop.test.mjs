import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startLocalApp } from "../dist/runtime/desktop/local-server.js";
import { isAllowedExternal } from "../dist/runtime/desktop/policy.js";
import { createChatgptService } from "../dist/runtime/server/chatgpt.js";
import { generateKeyPair, exportJWK, SignJWT } from "jose";

const deviceSecret = "test-private-desktop-session-1234567890";
const deviceCookie = "calendar-device=" + deviceSecret;
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "goal-calendar-test-"));
  t.after(() => {
    assert.ok(
      path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep),
    );
    return rm(root, { recursive: true, force: true });
  });
  const staticRoot = path.join(root, "public"),
    dataRoot = path.join(root, "data");
  await mkdir(path.join(staticRoot, "assets"), { recursive: true });
  await writeFile(
    path.join(staticRoot, "index.html"),
    "<!doctype html><title>Calendar</title>",
  );
  await writeFile(
    path.join(staticRoot, "assets", "app.js"),
    "export const calendar = true;",
  );
  return { staticRoot, dataRoot, deviceSecret };
}
test("Desktop serves only its own authenticated loopback session and blocks cross-origin requests", async (t) => {
  const runtime = await startLocalApp(await fixture(t));
  t.after(() => runtime.close());
  assert.equal((await fetch(runtime.origin)).status, 403);
  assert.equal((await fetch(runtime.origin + "/api/session")).status, 403);
  const headers = { Cookie: deviceCookie };
  const page = await fetch(runtime.origin, { headers });
  assert.equal(page.status, 200);
  assert.match(
    page.headers.get("content-security-policy"),
    /script-src 'self'/,
  );
  assert.equal(
    (await fetch(runtime.origin + "/assets/app.js", { headers })).status,
    200,
  );
  assert.equal(
    (
      await fetch(
        runtime.origin + "/assets/%2e%2e%2f%2e%2e%2fdata/desktop.json",
        { headers },
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await fetch(runtime.origin, {
        headers: { ...headers, Origin: "https://example.com" },
      })
    ).status,
    403,
  );
  const session = await fetch(runtime.origin + "/api/session", { headers });
  assert.equal(session.status, 200);
  const connection = await session.json();
  assert.equal(connection.connected, false);
  assert.equal(connection.account, null);
  const cookie = session.headers.get("set-cookie").split(";")[0];
  assert.equal(
    (
      await fetch(runtime.origin + "/api/auth/start", {
        method: "POST",
        headers: { Cookie: deviceCookie + "; " + cookie },
        body: "{}",
      })
    ).status,
    403,
  );
});
test("Desktop keeps its storage origin and host ID stable across restarts", async (t) => {
  const options = await fixture(t);
  const first = await startLocalApp(options);
  const origin = first.origin;
  const metadataPath = path.join(
    options.dataRoot,
    "connection",
    "registrations.json",
  );
  const firstId = JSON.parse(await readFile(metadataPath, "utf8")).hostId;
  await first.close();
  const second = await startLocalApp(options);
  t.after(() => second.close());
  assert.equal(second.origin, origin);
  assert.equal(
    JSON.parse(await readFile(metadataPath, "utf8")).hostId,
    firstId,
  );
});
test("Desktop refuses an occupied saved port instead of changing the calendar's storage origin", async (t) => {
  const options = await fixture(t);
  const first = await startLocalApp(options);
  t.after(() => first.close());
  await assert.rejects(() => startLocalApp(options), /saved local address/);
});
test("External links allow official sign-in/docs and this repository, rejecting executable and lookalike URLs", () => {
  for (const value of [
    "https://auth.openai.com/authorize?state=test",
    "https://developers.openai.com/siwc/token-sharing-open-source",
    "https://github.com/ellenWang918/appa/releases",
  ])
    assert.equal(isAllowedExternal(value), true);
  for (const value of [
    "file:///C:/Windows/system32/cmd.exe",
    "javascript:alert(1)",
    "https://auth.openai.com.evil.example/",
    "https://auth.openai.com@evil.example/",
    "https://auth.openai.com:8443/",
    "http://auth.openai.com/",
    "https://github.com/other/repo",
  ])
    assert.equal(isAllowedExternal(value), false);
});

for (const requireCallbackCookie of [true, false]) {
  test(`OAuth callback ${requireCallbackCookie ? "in browser mode requires its session cookie" : "from a desktop's system browser is bound by state and PKCE"}`, async (t) => {
    const { dataRoot } = await fixture(t);
    const service = createChatgptService({
      requireCallbackCookie,
      requestFetch: async (url) => {
        assert.equal(
          url,
          "https://auth.openai.com/.well-known/openid-configuration",
        );
        return Response.json({
          issuer: "https://auth.openai.com",
          authorization_endpoint: "https://auth.openai.com/authorize",
          token_endpoint: "https://auth.openai.com/token",
          jwks_uri: "https://auth.openai.com/jwks",
        });
      },
    });
    await service.initialize(dataRoot);
    const server = createServer((req, res) =>
      service.handle(req, res, () => res.end()),
    );
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    t.after(() => {
      service.close();
      server.closeAllConnections();
      return new Promise((resolve) => server.close(resolve));
    });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const sessionResponse = await fetch(origin + "/api/session");
    const session = await sessionResponse.json();
    const cookie = sessionResponse.headers.get("set-cookie").split(";")[0];
    const start = await fetch(origin + "/api/auth/start", {
      method: "POST",
      headers: { Cookie: cookie, "X-Calendar-CSRF": session.csrf },
      body: "{}",
    });
    const authorize = new URL((await start.json()).url);
    assert.equal(authorize.searchParams.get("code_challenge_method"), "S256");
    const callback = new URL(authorize.searchParams.get("redirect_uri"));
    callback.searchParams.set("state", authorize.searchParams.get("state"));
    callback.searchParams.set("client_id", "test-issued-client");
    // No code or token is submitted. This verifies the native browser boundary,
    // without impersonating account consent or using a real user's credentials.
    const response = await fetch(callback);
    assert.equal(response.status, 400);
    assert.match(
      await response.text(),
      requireCallbackCookie
        ? /attempt could not be verified/
        : /No authorization code/,
    );
    callback.searchParams.set("state", "untrusted-state");
    assert.match(
      await (await fetch(callback)).text(),
      /attempt could not be verified/,
    );
  });
}

async function signedSession(t, pause) {
  const { dataRoot } = await fixture(t);
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = {
    ...(await exportJWK(publicKey)),
    kid: "synthetic",
    alg: "RS256",
  };
  let nonce, release, entered;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (url, options) => {
    if (String(url) === "https://auth.openai.com/jwks")
      return Promise.resolve(Response.json({ keys: [jwk] }));
    assert.equal(
      new URL(url).hostname,
      "127.0.0.1",
      "Tests must not contact an external service",
    );
    return originalFetch(url, options);
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  const service = createChatgptService({
    requireCallbackCookie: false,
    requestFetch: async (url, options) => {
      if (String(url).endsWith("/.well-known/openid-configuration"))
        return Response.json({
          issuer: "https://auth.openai.com",
          authorization_endpoint: "https://auth.openai.com/authorize",
          token_endpoint: "https://auth.openai.com/token",
          jwks_uri: "https://auth.openai.com/jwks",
          revocation_endpoint: "https://auth.openai.com/revoke",
        });
      if (String(url) === "https://auth.openai.com/jwks")
        return Response.json({ keys: [jwk] });
      if (String(url) === "https://auth.openai.com/token") {
        const refresh =
          new URLSearchParams(options.body).get("grant_type") ===
          "refresh_token";
        if (
          (pause === "refresh" && refresh) ||
          (pause === "callback" && !refresh)
        ) {
          entered();
          await held;
        }
        const id_token = await new SignJWT({ nonce })
          .setProtectedHeader({ alg: "RS256", kid: "synthetic" })
          .setIssuer("https://auth.openai.com")
          .setSubject("synthetic-subject")
          .setAudience("synthetic-client")
          .setIssuedAt()
          .setExpirationTime("5m")
          .sign(privateKey);
        return Response.json({
          access_token: "synthetic-access",
          refresh_token: "synthetic-refresh",
          id_token,
          scope: "chatgpt.tokens.use.direct",
          expires_in: pause === "refresh" && !refresh ? 0 : 3600,
        });
      }
      if (String(url) === "https://auth.openai.com/revoke")
        return new Response(null, { status: 200 });
      if (String(url) === "https://api.openai.com/v1/models") {
        if (pause === "models") {
          entered();
          await held;
        }
        return Response.json({
          models: [
            {
              slug: "synthetic-model",
              display_name: "Synthetic model",
              visibility: "list",
            },
          ],
        });
      }
      throw new Error("Unexpected synthetic request");
    },
  });
  await service.initialize(dataRoot);
  const server = createServer((req, res) =>
    service.handle(req, res, () => res.end()),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    service.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const response = await originalFetch(origin + "/api/session"),
    session = await response.json();
  const headers = {
    Cookie: response.headers.get("set-cookie").split(";")[0],
    "X-Calendar-CSRF": session.csrf,
  };
  const api = (route, data) =>
    originalFetch(origin + "/api/" + route, {
      headers,
      ...(data === undefined
        ? {}
        : { method: "POST", body: JSON.stringify(data) }),
    });
  const start = await api("auth/start", {});
  const authorize = new URL((await start.json()).url);
  nonce = authorize.searchParams.get("nonce");
  const callback = new URL(authorize.searchParams.get("redirect_uri"));
  callback.searchParams.set("state", authorize.searchParams.get("state"));
  callback.searchParams.set("client_id", "synthetic-client");
  callback.searchParams.set("code", "synthetic-code");
  const finish = () => originalFetch(callback);
  return { api, finish, started, release };
}

for (const pause of ["refresh", "callback", "models"]) {
  test(`Disconnect prevents delayed ${pause} results from restoring account state`, async (t) => {
    const session = await signedSession(t, pause);
    if (pause !== "callback")
      assert.equal((await session.finish()).status, 200);
    const pending =
      pause === "callback" ? session.finish() : session.api("models");
    await session.started;
    assert.equal((await session.api("auth/disconnect", {})).status, 200);
    session.release();
    const completed = await pending;
    assert.equal(completed.status, 400);
    const after = await (await session.api("session")).json();
    assert.equal(after.connected, false);
    assert.equal(after.account, null);
    assert.deepEqual(after.models, []);
  });
}
