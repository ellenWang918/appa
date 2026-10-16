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
import { createCredentialStore } from "../dist/runtime/server/credential-store.js";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

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

async function signedSession(t, pause, options = {}) {
  const { dataRoot } = await fixture(t);
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = {
    ...(await exportJWK(publicKey)),
    kid: "synthetic",
    alg: "RS256",
  };
  let nonce, release, entered, tokenFailure;
  const refreshes = [];
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
  const serviceOptions = {
    ...options,
    credentialStore:
      typeof options.credentialStore === "function"
        ? options.credentialStore(dataRoot)
        : options.credentialStore,
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
        if (refresh) {
          const values = new URLSearchParams(options.body);
          refreshes.push(Object.fromEntries(values));
          if (tokenFailure)
            return Response.json(
              { error: tokenFailure },
              {
                status: tokenFailure === "temporarily_unavailable" ? 503 : 400,
              },
            );
        }
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
          refresh_token: refresh
            ? `synthetic-refresh-${refreshes.length}`
            : "synthetic-refresh",
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
  };
  let service, server, origin, headers;
  async function launch() {
    service = createChatgptService(serviceOptions);
    await service.initialize(dataRoot);
    server = createServer((req, res) =>
      service.handle(req, res, () => res.end()),
    );
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
    const response = await originalFetch(origin + "/api/session");
    const session = await response.json();
    headers = {
      Cookie: response.headers.get("set-cookie").split(";")[0],
      "X-Calendar-CSRF": session.csrf,
    };
  }
  async function stop() {
    service.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  await launch();
  t.after(stop);
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
  return {
    api,
    finish,
    started,
    release,
    dataRoot,
    refreshes,
    setTokenFailure: (failure) => {
      tokenFailure = failure;
    },
    restart: async () => {
      await stop();
      await launch();
    },
  };
}

test("A remembered ChatGPT session survives restart and sign-out removes it", async (t) => {
  let saved = null;
  const credentialStore = {
    load: async () => saved,
    save: async (value) => {
      saved = structuredClone(value);
    },
    clear: async () => {
      saved = null;
    },
  };
  const session = await signedSession(t, null, { credentialStore });
  assert.equal((await session.finish()).status, 200);
  assert.equal((await (await session.api("session")).json()).connected, true);
  await session.restart();
  const restored = await (await session.api("session")).json();
  assert.equal(
    restored.connected,
    true,
    "Reopening must restore the signed-in account",
  );
  assert.equal(restored.account.id, "synthetic-client");
  assert.equal((await session.api("models")).status, 200);
  assert.equal(JSON.stringify(restored).includes("synthetic-access"), false);
  assert.equal((await session.api("auth/disconnect", {})).status, 200);
  await session.restart();
  assert.equal((await (await session.api("session")).json()).connected, false);
});

function memoryCredentials() {
  let saved = null;
  return {
    load: async () => saved,
    save: async (value) => {
      saved = structuredClone(value);
    },
    clear: async () => {
      saved = null;
    },
    expire: () => {
      saved.credentials.expiresAt = 0;
    },
  };
}

test("A failed removal reports incomplete sign-out and a retry clears the saved session", async (t) => {
  const store = memoryCredentials();
  let blocked = true;
  const session = await signedSession(t, null, {
    credentialStore: {
      ...store,
      clear: async () => {
        if (blocked) throw new Error("Synthetic file access failure");
        await store.clear();
      },
    },
  });
  assert.equal((await session.finish()).status, 200);
  assert.equal((await session.api("auth/disconnect", {})).status, 200);
  const state = await (await session.api("session")).json();
  assert.equal(state.connected, false);
  assert.equal(state.signOutPending, true);
  assert.match(state.notice, /could not remove/);
  blocked = false;
  assert.equal((await session.api("auth/disconnect", {})).status, 200);
  assert.equal(await store.load(), null);
  await session.restart();
  assert.equal((await (await session.api("session")).json()).connected, false);
});

test("Reopening renews an expired token and persists the replacement refresh token", async (t) => {
  const store = memoryCredentials();
  const session = await signedSession(t, null, { credentialStore: store });
  assert.equal((await session.finish()).status, 200);
  store.expire();
  await session.restart();
  assert.equal((await (await session.api("session")).json()).connected, true);
  assert.equal(session.refreshes.length, 1);
  assert.deepEqual(session.refreshes[0], {
    grant_type: "refresh_token",
    client_id: "synthetic-client",
    refresh_token: "synthetic-refresh",
    resource: "https://api.openai.com/v1",
  });
  store.expire();
  await session.restart();
  assert.equal(session.refreshes[1].refresh_token, "synthetic-refresh-1");
  assert.equal(
    (await store.load()).credentials.refresh_token,
    "synthetic-refresh-2",
  );
});

test("Concurrent requests share one renewal of a remembered session", async (t) => {
  const session = await signedSession(t, "refresh", {
    credentialStore: memoryCredentials(),
  });
  assert.equal((await session.finish()).status, 200);
  const first = session.api("models");
  await session.started;
  const second = session.api("session");
  const third = session.api("models");
  session.release();
  for (const response of await Promise.all([first, second, third]))
    assert.equal(response.status, 200);
  assert.equal(session.refreshes.length, 1);
});

test("Revoked refresh tokens remove saved sign-in while network failures retain it for retry", async (t) => {
  const store = memoryCredentials();
  const session = await signedSession(t, null, { credentialStore: store });
  assert.equal((await session.finish()).status, 200);
  store.expire();
  session.setTokenFailure("temporarily_unavailable");
  await session.restart();
  let state = await (await session.api("session")).json();
  assert.equal(state.connected, true);
  assert.ok(await store.load());
  assert.match(state.notice, /Check your connection/);
  session.setTokenFailure("invalid_grant");
  state = await (await session.api("session")).json();
  assert.equal(state.connected, false);
  assert.equal(state.account, null);
  assert.equal(await store.load(), null);
  assert.match(state.notice, /Sign in again/);
  await session.restart();
  assert.equal((await (await session.api("session")).json()).connected, false);
});

function testProtection() {
  const key = randomBytes(32);
  return {
    isEncryptionAvailable: () => true,
    encryptString(value) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const encrypted = Buffer.concat([
        cipher.update(value, "utf8"),
        cipher.final(),
      ]);
      return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
    },
    decryptString(value) {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        key,
        value.subarray(0, 12),
      );
      decipher.setAuthTag(value.subarray(12, 28));
      return Buffer.concat([
        decipher.update(value.subarray(28)),
        decipher.final(),
      ]).toString("utf8");
    },
  };
}

test("Credential files are encrypted, restore after service restart, and are deleted on sign-out", async (t) => {
  let credentialFile;
  const session = await signedSession(t, null, {
    credentialStore: (directory) => {
      credentialFile = path.join(directory, "credentials.bin");
      return createCredentialStore(credentialFile, testProtection());
    },
  });
  assert.equal((await session.finish()).status, 200);
  const encrypted = await readFile(credentialFile);
  for (const secret of [
    "synthetic-access",
    "synthetic-refresh",
    "synthetic-subject",
  ])
    assert.equal(encrypted.includes(Buffer.from(secret)), false);
  const registration = await readFile(
    path.join(session.dataRoot, "registrations.json"),
    "utf8",
  );
  assert.equal(registration.includes("synthetic-access"), false);
  assert.equal(registration.includes("synthetic-refresh"), false);
  await session.restart();
  const restored = await (await session.api("session")).json();
  assert.equal(restored.connected, true);
  assert.equal(restored.remembered, true);
  assert.equal((await session.api("auth/disconnect", {})).status, 200);
  await assert.rejects(readFile(credentialFile), { code: "ENOENT" });
});

test("Unavailable encryption and damaged credentials leave the calendar usable without a plaintext fallback", async (t) => {
  const { dataRoot } = await fixture(t);
  const file = path.join(dataRoot, "credentials.bin");
  const protection = testProtection();
  const store = createCredentialStore(file, protection);
  await mkdir(dataRoot, { recursive: true });
  await writeFile(file, "damaged credentials");
  await assert.rejects(store.load(), /could not be restored/);
  assert.equal(await readFile(file, "utf8"), "damaged credentials");
  const session = await signedSession(t, null, { credentialStore: store });
  const state = await (await session.api("session")).json();
  assert.equal(state.connected, false);
  assert.match(state.notice, /Sign in again/);
  protection.isEncryptionAvailable = () => false;
  assert.equal((await session.finish()).status, 200);
  const signedIn = await (await session.api("session")).json();
  assert.equal(signedIn.connected, true);
  assert.equal(signedIn.remembered, false);
  assert.match(signedIn.notice, /could not securely remember/);
  assert.equal(await readFile(file, "utf8"), "damaged credentials");
});

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
