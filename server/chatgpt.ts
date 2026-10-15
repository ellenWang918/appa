import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import type { Account, Model, Plan } from "../src/types.js";
import { errorCode, errorMessage } from "../src/errors.js";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { validatePlan } from "../src/calendar.js";

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
  expires_in: number;
}
interface Credentials extends TokenResponse {
  client_id: string;
  subject: string;
  expiresAt: number;
}
interface LocalSession {
  csrf: string;
  generation: number;
  credentials: Credentials | null;
  account: Account | null;
  models?: Model[] | null;
  refreshing?: Promise<void> | null;
  busy?: boolean;
}
interface SignInAttempt {
  sessionId: string;
  generation: number;
  state: string;
  nonce: string;
  verifier: string;
  clientId: string;
  subject?: string;
  redirectUri: string;
  expiresAt: number;
}
interface Registrations {
  hostId: string;
  accounts: (Account & { subject: string })[];
}
interface Discovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  revocation_endpoint?: string;
}
interface StreamEvent {
  type: string;
  delta?: string;
  response?: { error?: { code?: string } };
  error?: { code?: string };
  code?: string;
}
interface ServiceOptions {
  requireCallbackCookie?: boolean;
  requestFetch?: typeof fetch;
}

const ISSUER = "https://auth.openai.com",
  RESOURCE = "https://api.openai.com/v1";
const random = () => randomBytes(32).toString("base64url");
export const equalSecret = (left: unknown, right: unknown) => {
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

export async function readResponseStream(response: Response): Promise<Plan> {
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
  function event(raw: string) {
    const data = raw
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");
    if (!data || data === "[DONE]") return;
    const item = JSON.parse(data) as StreamEvent;
    if (item.type === "response.output_text.delta") text += item.delta || "";
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
  if (!response.body)
    throw new Error(
      "The connection ended before the plan was complete. Try again.",
    );
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
}: ServiceOptions = {}) {
  const sessions = new Map<string, LocalSession>(),
    attempts = new Map<string, SignInAttempt>();
  let metadata: Registrations;
  let metadataFile: string;
  let callbackServer: Server | undefined;
  let callbackUri: string | undefined;
  let discovery: Discovery | undefined;
  let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
  const json = (res: ServerResponse, status: number, data: unknown) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(JSON.stringify(data));
  };
  const cookieId = (req: IncomingMessage) =>
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
      const loaded = (await response.json()) as Discovery;
      if (
        loaded.issuer !== ISSUER ||
        (
          ["authorization_endpoint", "token_endpoint", "jwks_uri"] as const
        ).some((key) => !loaded[key] || new URL(loaded[key]).origin !== ISSUER)
      )
        throw new Error("ChatGPT sign-in configuration could not be verified.");
      discovery = loaded;
      jwks = createRemoteJWKSet(new URL(loaded.jwks_uri));
    }
    return discovery;
  }
  async function tokenRequest(
    values: Record<string, string>,
  ): Promise<TokenResponse> {
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
    const tokens = (await response.json()) as TokenResponse;
    if (
      typeof tokens.access_token !== "string" ||
      !tokens.scope?.split(" ").includes("chatgpt.tokens.use.direct")
    )
      throw new Error(
        "ChatGPT plan usage was not enabled. Connect again and allow plan usage.",
      );
    return tokens;
  }
  async function ensureToken(session: LocalSession) {
    if (!session.credentials)
      throw new Error("Connect your ChatGPT account to create an AI plan.");
    if (session.credentials.expiresAt > Date.now() + 60000)
      return session.credentials.access_token;
    if (!session.credentials.refresh_token)
      throw new Error("Your ChatGPT connection expired. Connect again.");
    const credentials = session.credentials,
      generation = session.generation;
    if (!session.refreshing) {
      const refreshing: Promise<void> = (async () => {
        const tokens = await tokenRequest({
          grant_type: "refresh_token",
          client_id: credentials.client_id,
          refresh_token: credentials.refresh_token!,
          resource: RESOURCE,
        });
        assertGeneration(session, generation);
        session.credentials = {
          ...credentials,
          ...tokens,
          expiresAt: Date.now() + tokens.expires_in * 1000,
        };
      })().finally(() => {
        if (session.refreshing === refreshing) session.refreshing = null;
      });
      session.refreshing = refreshing;
    }
    await session.refreshing;
    assertGeneration(session, generation);
    if (!session.credentials)
      throw new Error("Your ChatGPT connection expired. Connect again.");
    return session.credentials.access_token;
  }
  function assertGeneration(session: LocalSession, generation: number) {
    if (session.generation !== generation)
      throw new Error(
        "Your ChatGPT connection changed. Connect again if needed.",
      );
  }
  async function modelsFor(session: LocalSession) {
    const generation = session.generation;
    const token = await ensureToken(session);
    assertGeneration(session, generation);
    const response = await requestFetch(RESOURCE + "/models", {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new Error(
        "Could not load models for this ChatGPT account. Try connecting again.",
      );
    const data = (await response.json()) as {
      models?: { visibility: string; slug: string; display_name: string }[];
    };
    assertGeneration(session, generation);
    session.models = (data.models || [])
      .filter((model) => model.visibility === "list")
      .map((model) => ({ id: model.slug, name: model.display_name }));
    if (!session.models.length)
      throw new Error("No eligible models are available for this account.");
    return session.models;
  }
  async function callback(req: IncomingMessage, res: ServerResponse) {
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
      const url = new URL(req.url || "/", callbackUri);
      if (url.pathname !== "/auth/callback") {
        res.writeHead(404);
        res.end();
        return;
      }
      const state = url.searchParams.get("state") || "",
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
      const session = sessions.get(attempt.sessionId);
      if (!session)
        throw new Error("The calendar session expired. Connect again.");
      assertGeneration(session, attempt.generation);
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
      const settings = await config();
      if (!tokens.id_token || !jwks)
        throw new Error("The ChatGPT account identity could not be verified.");
      const { payload } = await jwtVerify(tokens.id_token, jwks, {
        issuer: settings.issuer,
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
      assertGeneration(session, attempt.generation);
      session.generation++;
      session.refreshing = null;
      session.credentials = {
        ...tokens,
        client_id: clientId,
        subject: payload.sub,
        expiresAt: Date.now() + tokens.expires_in * 1000,
      };
      session.account = {
        id: clientId,
        label:
          typeof payload.email === "string"
            ? payload.email
            : typeof payload.name === "string"
              ? payload.name
              : "ChatGPT account",
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
      message = errorMessage(
        error,
        "ChatGPT connection failed. Return to the calendar and try again.",
      );
    }
    res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      `<!doctype html><meta name="referrer" content="no-referrer"><title>Appa</title><style>body{font:17px system-ui;color:#131c37;max-width:540px;margin:14vh auto;padding:24px;line-height:1.6}h1{font-size:24px}</style><h1>Appa</h1><p>${message.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] || char)}</p>`,
    );
  }
  async function listener(): Promise<string> {
    if (callbackServer) return callbackUri!;
    const server = (callbackServer = createServer((req, res) => {
      callback(req, res).catch(() => {
        res.writeHead(500);
        res.end("Connection failed. Please return to your calendar.");
      });
    }));
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("The local sign-in listener could not start.");
    callbackUri = `http://127.0.0.1:${address.port}/auth/callback`;
    return callbackUri;
  }
  async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
    let data = "";
    for await (const chunk of req) {
      data += chunk;
      if (data.length > 30000) throw new Error("This request is too large.");
    }
    return data ? JSON.parse(data) : {};
  }
  return {
    async initialize(dataDirectory: string) {
      metadataFile = path.join(dataDirectory, "registrations.json");
      try {
        metadata = JSON.parse(await readFile(metadataFile, "utf8"));
        if (!metadata.hostId || !Array.isArray(metadata.accounts))
          throw new Error();
      } catch (error) {
        if (errorCode(error) !== "ENOENT")
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
      for (const session of sessions.values()) {
        session.generation++;
        session.credentials = null;
      }
      sessions.clear();
      attempts.clear();
    },
    async handle(
      req: IncomingMessage,
      res: ServerResponse,
      next: () => void,
    ): Promise<void> {
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
        let sessionId = cookieId(req) || "",
          session = sessions.get(sessionId);
        if (url.pathname === "/api/session" && req.method === "GET") {
          if (!session) {
            sessionId = random();
            session = {
              csrf: random(),
              generation: 0,
              credentials: null,
              account: null,
            };
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
          const generation = session.generation;
          const input = await body(req),
            settings = await config(),
            redirectUri = await listener();
          const account = input.accountId
            ? metadata.accounts.find((a) => a.id === input.accountId)
            : null;
          if (input.accountId && !account)
            throw new Error("That saved account is no longer available.");
          assertGeneration(session, generation);
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
            generation,
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
          const credentials = session.credentials;
          session.generation++;
          session.credentials = null;
          session.account = null;
          session.models = null;
          session.refreshing = null;
          for (const [key, attempt] of attempts)
            if (attempt.sessionId === sessionId) attempts.delete(key);
          let revoked = true;
          try {
            if (credentials?.refresh_token) {
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
                    token: credentials.refresh_token,
                    token_type_hint: "refresh_token",
                    client_id: credentials.client_id,
                  }),
                  signal: AbortSignal.timeout(12000),
                },
              );
              revoked = response.ok;
            }
          } catch {
            revoked = false;
          }
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
          error: errorMessage(error, "The request could not be completed."),
        });
      }
    },
  };
}

export function chatgptPlugin(): Plugin {
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
