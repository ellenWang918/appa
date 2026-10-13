import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { createServer } from "node:http";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { validatePlan } from "../src/calendar.mjs";

const ISSUER = "https://auth.openai.com",
  RESOURCE = "https://api.openai.com/v1";
const random = () => randomBytes(32).toString("base64url");
export const equalSecret = (left, right) => {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const a = Buffer.from(left),
    b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};
const planSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    goalName: { type: "string" },
    kind: { type: "string", enum: ["project", "recurring"] },
    perWeek: { type: ["integer", "null"] },
    clarification: { type: ["string", "null"] },
    tasks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          minutes: { type: "integer" },
          dependsOn: { type: "array", items: { type: "integer" } },
        },
        required: ["title", "minutes", "dependsOn"],
      },
    },
  },
  required: ["goalName", "kind", "perWeek", "clarification", "tasks"],
};

export async function readResponseStream(response) {
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? "Your ChatGPT connection expired. Connect again."
        : response.status === 429
          ? "Your ChatGPT usage limit was reached. Review usage in ChatGPT Settings."
          : "ChatGPT could not create a plan. Try again shortly.",
    );
  let buffer = "",
    text = "",
    completed = false;
  const decoder = new TextDecoder();
  function event(raw) {
    const data = raw
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");
    if (!data || data === "[DONE]") return;
    const item = JSON.parse(data);
    if (item.type === "response.output_text.delta") text += item.delta;
    if (item.type === "response.completed") completed = true;
    if (item.type === "response.incomplete")
      throw new Error(
        "The plan was interrupted. Your intention is saved; try again.",
      );
    if (item.type === "response.failed" || item.type === "error") {
      const code = item.response?.error?.code || item.error?.code || item.code;
      throw new Error(
        code?.startsWith("subscription_sharing_usage_")
          ? "ChatGPT plan usage is unavailable or at its limit. Review usage in ChatGPT Settings."
          : "ChatGPT could not finish the plan. Try again.",
      );
    }
    if (item.type === "response.refusal.delta")
      throw new Error(
        "ChatGPT could not provide this plan. Try describing the goal differently.",
      );
  }
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let match;
    while ((match = /\r?\n\r?\n/.exec(buffer))) {
      event(buffer.slice(0, match.index).replace(/\r\n/g, "\n"));
      buffer = buffer.slice(match.index + match[0].length);
    }
  }
  if (buffer.trim()) event(buffer);
  if (!completed)
    throw new Error(
      "The connection ended before the plan was complete. Try again.",
    );
  return validatePlan(JSON.parse(text));
}

export function createChatgptService({
  requireCallbackCookie = true,
  requestFetch = fetch,
} = {}) {
  const sessions = new Map(),
    attempts = new Map();
  let metadata, metadataFile, callbackServer, callbackUri, discovery, jwks;
  const json = (res, status, data) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(JSON.stringify(data));
  };
  const cookieId = (req) =>
    req.headers.cookie
      ?.split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("calendar-session="))
      ?.slice(17);
  async function saveMetadata() {
    await mkdir(path.dirname(metadataFile), { recursive: true, mode: 0o700 });
    const temporary = metadataFile + ".tmp";
    await writeFile(temporary, JSON.stringify(metadata), { mode: 0o600 });
    await rename(temporary, metadataFile);
  }
  async function config() {
    if (!discovery) {
      const response = await requestFetch(
        ISSUER + "/.well-known/openid-configuration",
        { signal: AbortSignal.timeout(12000) },
      );
      if (!response.ok)
        throw new Error("ChatGPT sign-in is temporarily unavailable.");
      discovery = await response.json();
      if (
        discovery.issuer !== ISSUER ||
        ["authorization_endpoint", "token_endpoint", "jwks_uri"].some(
          (key) => !discovery[key] || new URL(discovery[key]).origin !== ISSUER,
        )
      )
        throw new Error("ChatGPT sign-in configuration could not be verified.");
      jwks = createRemoteJWKSet(new URL(discovery.jwks_uri));
    }
    return discovery;
  }
  async function tokenRequest(values) {
    const settings = await config();
    const response = await requestFetch(settings.token_endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(values),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok)
      throw new Error(
        "ChatGPT authorization could not be completed. Please connect again.",
      );
    const tokens = await response.json();
    if (
      typeof tokens.access_token !== "string" ||
      !tokens.scope?.split(" ").includes("chatgpt.tokens.use.direct")
    )
      throw new Error(
        "ChatGPT plan usage was not enabled. Connect again and allow plan usage.",
      );
    return tokens;
  }
  async function ensureToken(session) {
    if (!session.credentials)
      throw new Error("Connect your ChatGPT account to create an AI plan.");
    if (session.credentials.expiresAt > Date.now() + 60000)
      return session.credentials.access_token;
    if (!session.credentials.refresh_token)
      throw new Error("Your ChatGPT connection expired. Connect again.");
    if (!session.refreshing)
      session.refreshing = (async () => {
        const tokens = await tokenRequest({
          grant_type: "refresh_token",
          client_id: session.credentials.client_id,
          refresh_token: session.credentials.refresh_token,
          resource: RESOURCE,
        });
        session.credentials = {
          ...session.credentials,
          ...tokens,
          expiresAt: Date.now() + tokens.expires_in * 1000,
        };
      })().finally(() => {
        session.refreshing = null;
      });
    await session.refreshing;
    return session.credentials.access_token;
  }
  async function modelsFor(session) {
    const token = await ensureToken(session);
    const response = await requestFetch(RESOURCE + "/models", {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new Error(
        "Could not load models for this ChatGPT account. Try connecting again.",
      );
    const data = await response.json();
    session.models = (data.models || [])
      .filter((model) => model.visibility === "list")
      .map((model) => ({ id: model.slug, name: model.display_name }));
    if (!session.models.length)
      throw new Error("No eligible models are available for this account.");
    return session.models;
  }
  async function callback(req, res) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; style-src 'unsafe-inline'",
    );
    let message =
        "ChatGPT is connected. You can close this tab and return to your calendar.",
      status = 200;
    try {
      const url = new URL(req.url, callbackUri);
      if (url.pathname !== "/auth/callback") {
        res.writeHead(404);
        res.end();
        return;
      }
      const state = url.searchParams.get("state"),
        attempt = attempts.get(state);
      attempts.delete(state);
      if (
        !attempt ||
        attempt.expiresAt < Date.now() ||
        (requireCallbackCookie &&
          !equalSecret(cookieId(req), attempt.sessionId))
      )
        throw new Error(
          "The sign-in attempt could not be verified. Return to the calendar and connect again.",
        );
      if (url.searchParams.has("error"))
        throw new Error(
          "ChatGPT connection was cancelled. Your calendar is unchanged.",
        );
      const clientId = url.searchParams.get("client_id") || attempt.clientId;
      if (
        !clientId ||
        clientId === "dynamic_agent_client" ||
        (attempt.clientId !== "dynamic_agent_client" &&
          clientId !== attempt.clientId)
      )
        throw new Error("ChatGPT registration was incomplete. Connect again.");
      const code = url.searchParams.get("code");
      if (!code)
        throw new Error("No authorization code was returned. Connect again.");
      const tokens = await tokenRequest({
        grant_type: "authorization_code",
        client_id: clientId,
        code,
        code_verifier: attempt.verifier,
        redirect_uri: attempt.redirectUri,
        resource: RESOURCE,
      });
      await config();
      const { payload } = await jwtVerify(tokens.id_token, jwks, {
        issuer: discovery.issuer,
        audience: clientId,
        requiredClaims: ["sub", "exp", "iat"],
        clockTolerance: 5,
        maxTokenAge: "10m",
      });
      if (
        !equalSecret(payload.nonce, attempt.nonce) ||
        typeof payload.sub !== "string" ||
        (attempt.subject && payload.sub !== attempt.subject)
      )
        throw new Error(
          "The ChatGPT account identity did not match this connection.",
        );
      const session = sessions.get(attempt.sessionId);
      if (!session)
        throw new Error("The calendar session expired. Connect again.");
      session.credentials = {
        ...tokens,
        client_id: clientId,
        subject: payload.sub,
        expiresAt: Date.now() + tokens.expires_in * 1000,
      };
      session.account = {
        id: clientId,
        label: payload.email || payload.name || "ChatGPT account",
      };
      session.models = null;
      metadata.accounts = metadata.accounts.filter(
        (account) => account.id !== clientId,
      );
      metadata.accounts.push({
        id: clientId,
        subject: payload.sub,
        label: session.account.label,
      });
      await saveMetadata();
    } catch (error) {
      status = 400;
      message =
        error.message ||
        "ChatGPT connection failed. Return to the calendar and try again.";
    }
    res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      `<!doctype html><meta name="referrer" content="no-referrer"><title>Appa</title><style>body{font:17px system-ui;color:#131c37;max-width:540px;margin:14vh auto;padding:24px;line-height:1.6}h1{font-size:24px}</style><h1>Appa</h1><p>${message.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char])}</p>`,
    );
  }
  async function listener() {
    if (callbackServer) return callbackUri;
    callbackServer = createServer((req, res) => {
      callback(req, res).catch(() => {
        res.writeHead(500);
        res.end("Connection failed. Please return to your calendar.");
      });
    });
    await new Promise((resolve, reject) => {
      callbackServer.once("error", reject);
      callbackServer.listen(0, "127.0.0.1", resolve);
    });
    callbackUri = `http://127.0.0.1:${callbackServer.address().port}/auth/callback`;
    return callbackUri;
  }
  async function body(req) {
    let data = "";
    for await (const chunk of req) {
      data += chunk;
      if (data.length > 30000) throw new Error("This request is too large.");
    }
    return data ? JSON.parse(data) : {};
  }
  return {
    async initialize(dataDirectory) {
      metadataFile = path.join(dataDirectory, "registrations.json");
      try {
        metadata = JSON.parse(await readFile(metadataFile, "utf8"));
        if (!metadata.hostId || !Array.isArray(metadata.accounts))
          throw new Error();
      } catch (error) {
        if (error.code !== "ENOENT")
          throw new Error(
            "Your saved ChatGPT registration could not be read. Restore its backup or contact the maintainer before reconnecting.",
          );
        metadata = { hostId: `urn:uuid:${randomUUID()}`, accounts: [] };
        await saveMetadata();
      }
    },
    close() {
      callbackServer?.closeAllConnections();
      callbackServer?.close();
      sessions.clear();
      attempts.clear();
    },
    async handle(req, res, next) {
      if (!req.url?.startsWith("/api/")) return next();
      try {
        const origin = `http://${req.headers.host}`,
          hostname = new URL(origin).hostname;
        if (!["127.0.0.1", "localhost", "[::1]"].includes(hostname))
          return json(res, 403, {
            error: "This connection is available only on your computer.",
          });
        if (req.headers.origin && req.headers.origin !== origin)
          return json(res, 403, {
            error: "This request came from another website.",
          });
        const url = new URL(req.url, origin);
        let sessionId = cookieId(req),
          session = sessions.get(sessionId);
        if (url.pathname === "/api/session" && req.method === "GET") {
          if (!session) {
            sessionId = random();
            session = { csrf: random(), credentials: null, account: null };
            sessions.set(sessionId, session);
            res.setHeader(
              "Set-Cookie",
              `calendar-session=${sessionId}; Path=/; HttpOnly; SameSite=Lax`,
            );
          }
          return json(res, 200, {
            csrf: session.csrf,
            connected: !!session.credentials,
            account: session.account,
            accounts: metadata.accounts.map(({ id, label }) => ({
              id,
              label,
            })),
            models: session.models || [],
          });
        }
        if (!session)
          return json(res, 401, {
            error: "Refresh your calendar and try again.",
          });
        if (
          req.method === "POST" &&
          !equalSecret(req.headers["x-calendar-csrf"], session.csrf)
        )
          return json(res, 403, {
            error: "Refresh your calendar before trying again.",
          });
        if (url.pathname === "/api/auth/start" && req.method === "POST") {
          if (hostname !== "127.0.0.1")
            throw new Error(
              "Open the calendar using its 127.0.0.1 preview address before connecting ChatGPT.",
            );
          const input = await body(req),
            settings = await config(),
            redirectUri = await listener();
          const account = input.accountId
            ? metadata.accounts.find((a) => a.id === input.accountId)
            : null;
          if (input.accountId && !account)
            throw new Error("That saved account is no longer available.");
          const verifier = randomBytes(64).toString("base64url"),
            state = random(),
            nonce = random(),
            clientId = account?.id || "dynamic_agent_client";
          for (const [key, attempt] of attempts)
            if (
              attempt.expiresAt < Date.now() ||
              attempt.sessionId === sessionId
            )
              attempts.delete(key);
          attempts.set(state, {
            sessionId,
            state,
            nonce,
            verifier,
            clientId,
            subject: account?.subject,
            redirectUri,
            expiresAt: Date.now() + 600000,
          });
          const authorize = new URL(settings.authorization_endpoint);
          authorize.search = new URLSearchParams({
            client_id: clientId,
            ...(!account ? { agent_name_hint: "Appa" } : {}),
            ext_agent_host_id: metadata.hostId,
            response_type: "code",
            redirect_uri: redirectUri,
            scope:
              "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct",
            resource: RESOURCE,
            state,
            nonce,
            code_challenge_method: "S256",
            code_challenge: createHash("sha256")
              .update(verifier)
              .digest("base64url"),
          }).toString();
          return json(res, 200, { url: authorize.toString() });
        }
        if (url.pathname === "/api/models" && req.method === "GET")
          return json(res, 200, { models: await modelsFor(session) });
        if (url.pathname === "/api/auth/disconnect" && req.method === "POST") {
          let revoked = true;
          try {
            if (session.credentials?.refresh_token) {
              const settings = await config();
              if (
                !settings.revocation_endpoint ||
                new URL(settings.revocation_endpoint).origin !== ISSUER
              )
                throw new Error();
              const response = await requestFetch(
                settings.revocation_endpoint,
                {
                  method: "POST",
                  headers: {
                    "content-type": "application/x-www-form-urlencoded",
                  },
                  body: new URLSearchParams({
                    token: session.credentials.refresh_token,
                    token_type_hint: "refresh_token",
                    client_id: session.credentials.client_id,
                  }),
                  signal: AbortSignal.timeout(12000),
                },
              );
              revoked = response.ok;
            }
          } catch {
            revoked = false;
          }
          session.credentials = null;
          session.account = null;
          session.models = null;
          return json(res, 200, { revoked });
        }
        if (url.pathname === "/api/plan" && req.method === "POST") {
          const input = await body(req);
          if (
            typeof input.intention !== "string" ||
            !input.intention.trim() ||
            input.intention.length > 4000
          )
            throw new Error("Describe a goal using up to 4,000 characters.");
          if (session.busy)
            throw new Error("One plan is already being created. Please wait.");
          session.busy = true;
          try {
            const token = await ensureToken(session),
              models = session.models || (await modelsFor(session)),
              model = input.model || models[0].id;
            if (!models.some((m) => m.id === model))
              throw new Error(
                "Choose a model available to your ChatGPT account.",
              );
            const response = await requestFetch(RESOURCE + "/responses", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              signal: AbortSignal.timeout(90000),
              body: JSON.stringify({
                model,
                store: false,
                stream: true,
                instructions:
                  "Help a person start a goal without overwhelm. Return a short editable proposal, not a scheduled commitment. Use 3–8 specific actions aimed at 5–25 minutes. Use only genuine prerequisites: dependsOn is a list of zero-based indices of earlier tasks. For a recurring activity set kind recurring, extract perWeek 1–7, and return 1–3 useful session types with no dependencies. For a finite project set kind project and perWeek null. If essential context is missing ask one short clarification, set clarification to that question, and tasks to an empty array. Otherwise clarification is null. Never claim work is complete. Return the required JSON structure.",
                input: [{ role: "user", content: input.intention }],
                text: {
                  format: {
                    type: "json_schema",
                    name: "goal_plan",
                    strict: true,
                    schema: planSchema,
                  },
                },
              }),
            });
            return json(res, 200, {
              plan: await readResponseStream(response),
            });
          } finally {
            session.busy = false;
          }
        }
        return json(res, 404, { error: "This action is unavailable." });
      } catch (error) {
        return json(res, 400, {
          error: error.message || "The request could not be completed.",
        });
      }
    },
  };
}

export function chatgptPlugin() {
  const service = createChatgptService();
  return {
    name: "local-chatgpt-plan",
    async configureServer(server) {
      await service.initialize(path.join(server.config.root, ".local"));
      server.httpServer?.once("close", () => service.close());
      server.middlewares.use(service.handle);
    },
  };
}
