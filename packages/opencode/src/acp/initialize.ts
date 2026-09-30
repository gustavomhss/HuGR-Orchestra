import type { AuthMethod, InitializeRequest, InitializeResponse } from "@agentclientprotocol/sdk"
import { InstallationVersion } from "@opencode-ai/core/installation/version"

export const AuthMethodID = "opencode-login"

export function response(params: InitializeRequest): InitializeResponse {
  const authMethod: AuthMethod = {
    description: "Run `opencode auth login` in the terminal",
    name: "Login with opencode",
    id: AuthMethodID,
  }
  if (params.clientCapabilities?._meta?.["terminal-auth"] === true) {
    authMethod._meta = {
      "terminal-auth": { command: "opencode", args: ["auth", "login"], label: "OpenCode Login" },
    }
  }
  return {
    protocolVersion: 1,
    agentCapabilities: {
      loadSession: true,
      mcpCapabilities: { http: true, sse: true },
      promptCapabilities: { embeddedContext: true, image: true },
      sessionCapabilities: { close: {}, fork: {}, list: {}, resume: {} },
    },
    authMethods: [authMethod],
    agentInfo: { name: "OpenCode", version: InstallationVersion },
  }
}

export * as ACPInitialize from "./initialize"
