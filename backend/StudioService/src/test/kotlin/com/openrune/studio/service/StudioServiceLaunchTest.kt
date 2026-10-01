package com.openrune.studio.service

import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

class StudioServiceLaunchTest {
    @Test
    fun launchConfigAcceptsEphemeralPortAndParentSuppliedToken() {
        val config =
            StudioServiceLaunchConfig.parse(
                args =
                    arrayOf(
                        "--host",
                        "127.0.0.1",
                        "--port",
                        "0",
                        "--token",
                        TEST_TOKEN,
                    ),
                environment = emptyMap(),
            )

        assertEquals("127.0.0.1", config.host)
        assertEquals(0, config.port)
        assertEquals(TEST_TOKEN, config.token)
    }

    @Test
    fun launchConfigRejectsNonLoopbackBindHost() {
        assertFailsWith<IllegalArgumentException> {
            StudioServiceLaunchConfig.parse(
                args = arrayOf("--host", "0.0.0.0"),
                environment = emptyMap(),
            )
        }
    }

    @Test
    fun generatedTokenFallbackRemainsAvailable() {
        val security = StudioServiceSecurity.create(environmentToken = null)

        assertTrue(security.generatedToken)
        assertTrue(security.token.length >= 24)
    }

    @Test
    fun portZeroReportsActualEndpointAndStatusUsesSameIdentity() {
        val identity =
            StudioServiceIdentity(
                backendInstanceId = "launch-test-instance",
                backendVersion = "test-version",
                backendBuild = "test-build",
            )
        val security = StudioServiceSecurity(TEST_TOKEN)

        startStudioService(
            config =
                StudioServiceLaunchConfig(
                    host = "127.0.0.1",
                    port = 0,
                    token = TEST_TOKEN,
                ),
            security = security,
            identity = identity,
        ).use { running ->
            val endpoint = URI.create(running.ready.endpoint)

            assertNotEquals(0, endpoint.port)
            assertTrue(endpoint.port in 1..65535)
            assertEquals("launch-test-instance", running.ready.backendInstanceId)

            val response =
                HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(5))
                    .build()
                    .send(
                        HttpRequest.newBuilder(
                            URI.create("${running.ready.endpoint}/api/v1/status"),
                        )
                            .timeout(Duration.ofSeconds(5))
                            .header(StudioServiceSecurity.TOKEN_HEADER, TEST_TOKEN)
                            .GET()
                            .build(),
                        HttpResponse.BodyHandlers.ofString(),
                    )

            assertEquals(200, response.statusCode())
            assertTrue(response.body().contains("\"backendInstanceId\":\"launch-test-instance\""))
            assertTrue(response.body().contains("\"protocolVersion\":1"))
        }
    }

    @Test
    fun readyHandshakeDoesNotLeakToken() {
        val identity =
            StudioServiceIdentity(
                backendInstanceId = "ready-test-instance",
                backendVersion = "test-version",
                backendBuild = "test-build",
            )
        val security = StudioServiceSecurity(TEST_TOKEN)

        startStudioService(
            config = StudioServiceLaunchConfig(port = 0, token = TEST_TOKEN),
            security = security,
            identity = identity,
        ).use { running ->
            val json = readyHandshakeJson(running.ready)

            assertTrue(json.contains("\"protocolVersion\":1"))
            assertTrue(json.contains("\"backendInstanceId\":\"ready-test-instance\""))
            assertTrue(json.contains("\"endpoint\":\"http://127.0.0.1:"))
            assertTrue(json.contains("\"pid\":"))
            assertFalse(json.contains(TEST_TOKEN))
        }
    }

    private companion object {
        const val TEST_TOKEN = "parent-supplied-token-with-32-characters"
    }
}
