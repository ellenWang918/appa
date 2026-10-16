import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { Account } from "../src/types.js";
import { errorCode } from "../src/errors.js";

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
  expires_in: number;
}
export interface Credentials extends TokenResponse {
  client_id: string;
  subject: string;
  expiresAt: number;
}
export interface SavedConnection {
  version: 1;
  hostId: string;
  account: Account;
  credentials: Credentials;
}
export interface CredentialStore {
  load(): Promise<SavedConnection | null>;
  save(connection: SavedConnection): Promise<void>;
  clear(): Promise<void>;
}
export interface CredentialProtection {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

// Only the main process supplies the OS encryptor. No plaintext fallback.
export function createCredentialStore(
  file: string,
  protection: CredentialProtection,
): CredentialStore {
  function requireEncryption() {
    if (!protection.isEncryptionAvailable())
      throw new Error("Secure ChatGPT sign-in storage is unavailable.");
  }
  return {
    async load() {
      let encrypted: Buffer;
      try {
        encrypted = await readFile(file);
      } catch (error) {
        if (errorCode(error) === "ENOENT") return null;
        throw new Error("Your saved ChatGPT sign-in could not be read.");
      }
      try {
        requireEncryption();
        const saved = JSON.parse(
          protection.decryptString(encrypted),
        ) as SavedConnection;
        const c = saved?.credentials;
        if (
          saved?.version !== 1 ||
          typeof saved.hostId !== "string" ||
          !saved.hostId ||
          typeof saved.account?.id !== "string" ||
          typeof saved.account?.label !== "string" ||
          !c ||
          c.client_id !== saved.account.id ||
          c.client_id === "dynamic_agent_client" ||
          !c.client_id ||
          typeof c.subject !== "string" ||
          !c.subject ||
          typeof c.access_token !== "string" ||
          !c.access_token ||
          typeof c.refresh_token !== "string" ||
          !c.refresh_token ||
          typeof c.expiresAt !== "number" ||
          !Number.isFinite(c.expiresAt) ||
          !Number.isFinite(c.expires_in) ||
          typeof c.scope !== "string" ||
          !c.scope.split(" ").includes("chatgpt.tokens.use.direct")
        )
          throw new Error();
        return saved;
      } catch {
        // Never relay decryptor errors, which may include credential contents.
        throw new Error(
          "Your saved ChatGPT sign-in could not be restored. Sign in again.",
        );
      }
    },
    async save(connection) {
      requireEncryption();
      const encrypted = protection.encryptString(JSON.stringify(connection));
      await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
      const temporary = file + "." + randomUUID() + ".tmp";
      try {
        await writeFile(temporary, encrypted, { mode: 0o600, flag: "wx" });
        await rename(temporary, file);
      } finally {
        await rm(temporary, { force: true });
      }
    },
    async clear() {
      await rm(file, { force: true });
    },
  };
}
