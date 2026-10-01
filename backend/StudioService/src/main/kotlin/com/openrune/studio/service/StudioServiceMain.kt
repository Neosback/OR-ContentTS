package com.openrune.studio.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.openrune.studio.protocol.STUDIO_BACKEND_PROTOCOL_VERSION
import com.openrune.studio.protocol.StudioBackendReady
import io.ktor.server.engine.embeddedServer
import io.ktor.server.netty.Netty
import java.util.concurrent.CountDownLatch
import kotlinx.coroutines.runBlocking

private const val DEFAULT_HOST = "127.0.0.1"
private const val DEFAULT_PORT = 8765
private val READY_JSON = ObjectMapper()
private val LOOPBACK_BIND_HOSTS = setOf("127.0.0.1", "localhost", "::1")

data class StudioServiceLaunchConfig(
    val host: String = DEFAULT_HOST,
    val port: Int = DEFAULT_PORT,
    val token: String? = null,
) {
    init {
        require(host in LOOPBACK_BIND_HOSTS) {
            "Studio backend host must be loopback: 127.0.0.1, localhost, or ::1"
        }
        require(port in 0..65535) {
            "Studio backend port must be between 0 and 65535"
        }
    }

    companion object {
        fun parse(
            args: Array<String>,
            environment: Map<String, String> = System.getenv(),
        ): StudioServiceLaunchConfig {
            var host = environment["OPENRUNE_STUDIO_HOST"]?.trim().orEmpty().ifBlank { DEFAULT_HOST }
            var port =
                environment["OPENRUNE_STUDIO_PORT"]
                    ?.trim()
                    ?.toIntOrNull()
                    ?.takeIf { it in 0..65535 }
                    ?: DEFAULT_PORT
            var token = environment["OPENRUNE_STUDIO_TOKEN"]?.trim()?.takeIf { it.isNotEmpty() }

            var index = 0
            while (index < args.size) {
                val option = args[index]
                fun nextValue(): String {
                    require(index + 1 < args.size) { "Missing value for $option" }
                    index += 1
                    return args[index]
                }

                when (option) {
                    "--host" -> host = nextValue().trim()
                    "--port" -> {
                        val value = nextValue()
                        port = value.toIntOrNull() ?: error("Invalid --port value: $value")
                    }
                    "--token" -> token = nextValue().trim().takeIf { it.isNotEmpty() }
                    else -> error("Unknown Studio backend argument: $option")
                }
                index += 1
            }

            return StudioServiceLaunchConfig(
                host = host,
                port = port,
                token = token,
            )
        }
    }
}

class RunningStudioService internal constructor(
    val ready: StudioBackendReady,
    private val stopAction: () -> Unit,
) : AutoCloseable {
    @Volatile
    private var closed = false

    override fun close() {
        if (!closed) {
            closed = true
            stopAction()
        }
    }
}

fun startStudioService(
    config: StudioServiceLaunchConfig,
    security: StudioServiceSecurity = StudioServiceSecurity.create(config.token),
    identity: StudioServiceIdentity = StudioServiceIdentity(),
): RunningStudioService {
    val server =
        embeddedServer(
            factory = Netty,
            host = config.host,
            port = config.port,
            module = {
                studioServiceModule(
                    security = security,
                    identity = identity,
                )
            },
        )

    server.start(wait = false)

    val connector =
        runBlocking {
            server.engine.resolvedConnectors().single()
        }

    val endpoint = "http://${endpointHost(config.host)}:${connector.port}"
    val ready =
        StudioBackendReady(
            protocolVersion = STUDIO_BACKEND_PROTOCOL_VERSION,
            backendInstanceId = identity.backendInstanceId,
            endpoint = endpoint,
            pid = ProcessHandle.current().pid(),
        )

    return RunningStudioService(
        ready = ready,
        stopAction = { server.stop(1_000, 5_000) },
    )
}

internal fun readyHandshakeJson(ready: StudioBackendReady): String =
    READY_JSON.writeValueAsString(ready)

fun main(args: Array<String>) {
    val config = StudioServiceLaunchConfig.parse(args)
    val security = StudioServiceSecurity.create(config.token)
    val identity = StudioServiceIdentity()

    if (security.generatedToken) {
        System.err.println(
            "OpenRune Content Studio backend token: ${security.token}\n" +
                "Pass --token or set OPENRUNE_STUDIO_TOKEN to provide the session token.",
        )
    }

    val running = startStudioService(config, security, identity)

    println(readyHandshakeJson(running.ready))
    System.out.flush()

    Runtime.getRuntime().addShutdownHook(
        Thread {
            running.close()
        },
    )

    CountDownLatch(1).await()
}

private fun endpointHost(host: String): String =
    if (host.contains(':') && !host.startsWith("[")) {
        "[$host]"
    } else {
        host
    }
