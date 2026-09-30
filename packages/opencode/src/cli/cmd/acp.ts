import { Deferred, Effect } from "effect"
import { cmd } from "./cmd"
import { AgentSideConnection, ndJsonStream } from "@agentclientprotocol/sdk"
import { ServerAuth } from "@/server/auth"
import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { withNetworkOptions, resolveNetworkOptions } from "../network"
import { ACPProfile } from "@/acp/profile"
import { ACPInitialize } from "@/acp/initialize"
import type { Agent } from "@/acp/agent"

export const AcpCommand = cmd({
  command: "acp",
  describe: "start ACP (Agent Client Protocol) server",
  builder: (yargs) => {
    return withNetworkOptions(yargs).option("cwd", {
      describe: "working directory",
      type: "string",
      default: process.cwd(),
    })
  },
  handler: (args) =>
    Effect.runPromise(
      Effect.gen(function* () {
        ACPProfile.mark("cli.acp.handler")
        process.env.OPENCODE_CLIENT = "acp"
        const input = new WritableStream<Uint8Array>({
          write(chunk) {
            return new Promise<void>((resolve, reject) => {
              process.stdout.write(chunk, (err) => {
                if (err) {
                  reject(err)
                } else {
                  resolve()
                }
              })
            })
          },
        })
        const ended = yield* Deferred.make<void>()
        const output = new ReadableStream<Uint8Array>({
          start(controller) {
            if (process.stdin.readableEnded) {
              controller.close()
              Deferred.doneUnsafe(ended, Effect.void)
              return
            }
            process.stdin.on("data", (chunk: Buffer) => {
              controller.enqueue(new Uint8Array(chunk))
            })
            process.stdin.on("end", () => {
              ACPProfile.mark("cli.acp.stdin.end")
              controller.close()
              Deferred.doneUnsafe(ended, Effect.void)
            })
            process.stdin.on("error", (err) => {
              controller.error(err)
              Deferred.doneUnsafe(ended, Effect.die(err))
            })
          },
        })

        const ready = yield* Deferred.make<Agent>()
        const withAgent = <A>(fn: (agent: Agent) => Promise<A>) => Effect.runPromise(Deferred.await(ready)).then(fn)
        const connection = new AgentSideConnection(
          () => ({
            initialize: async (params) => ACPInitialize.response(params),
            authenticate: (params) => withAgent((agent) => agent.authenticate(params)),
            newSession: (params) => withAgent((agent) => agent.newSession(params)),
            loadSession: (params) => withAgent((agent) => agent.loadSession(params)),
            listSessions: (params) => withAgent((agent) => agent.listSessions(params)),
            resumeSession: (params) => withAgent((agent) => agent.resumeSession(params)),
            closeSession: (params) => withAgent((agent) => agent.closeSession(params)),
            unstable_forkSession: (params) => withAgent((agent) => agent.unstable_forkSession(params)),
            setSessionConfigOption: (params) => withAgent((agent) => agent.setSessionConfigOption(params)),
            setSessionMode: (params) => withAgent((agent) => agent.setSessionMode(params)),
            unstable_setSessionModel: (params) => withAgent((agent) => agent.unstable_setSessionModel(params)),
            prompt: (params) => withAgent((agent) => agent.prompt(params)),
            cancel: (params) => withAgent((agent) => agent.cancel(params)),
          }),
          ndJsonStream(input, output),
        )
        process.stdin.resume()
        // EOF must also stop startup before heavy imports and server setup complete.
        yield* Effect.raceFirst(
          Effect.gen(function* () {
            const modules = yield* Effect.all(
              {
                server: Effect.promise(() =>
                  ACPProfile.measure("cli.acp.server.import", () => import("@/server/server")),
                ),
                agent: Effect.promise(() => ACPProfile.measure("cli.acp.agent.import", () => import("@/acp/agent"))),
                runtime: Effect.promise(() =>
                  ACPProfile.measure("cli.acp.runtime.import", () => import("@/effect/app-runtime")),
                ),
              },
              { concurrency: "unbounded" },
            )
            const opts = yield* Effect.promise((signal) =>
              modules.runtime.AppRuntime.runPromise(resolveNetworkOptions(args), { signal }),
            )
            const server = yield* Effect.promise(() =>
              ACPProfile.measure("cli.acp.server.listen", () => modules.server.Server.listen(opts)),
            )
            const sdk = createOpencodeClient({
              baseUrl: `http://${server.hostname}:${server.port}`,
              headers: ServerAuth.headers(),
            })
            const agent = modules.agent.ACP.init({ sdk })
            ACPProfile.mark("cli.acp.connection.create")
            yield* Deferred.succeed(ready, agent.create(connection))
            yield* Effect.promise((signal) =>
              modules.runtime.AppRuntime.runPromise(Effect.logInfo("setup connection"), { signal }),
            )
            yield* Deferred.await(ended)
          }),
          Deferred.await(ended),
        )
      }).pipe(Effect.withSpan("Cli.acp")),
    ),
})
