package com.openrune.studio.protocol

const val STUDIO_API_VERSION = 1
const val STUDIO_BACKEND_PROTOCOL_VERSION = 1

data class StudioBackendReady(
    val protocolVersion: Int,
    val backendInstanceId: String,
    val endpoint: String,
    val pid: Long,
) {
    init {
        require(protocolVersion > 0) { "protocolVersion must be positive" }
        require(backendInstanceId.isNotBlank()) { "backendInstanceId is required" }
        require(endpoint.isNotBlank()) { "endpoint is required" }
        require(pid > 0) { "pid must be positive" }
    }
}

data class StudioBackendStatus(
    val name: String,
    val apiVersion: Int,
    val protocolVersion: Int,
    val backendInstanceId: String,
    val backendVersion: String,
    val backendBuild: String,
    val status: String,
    val capabilities: List<String>,
) {
    init {
        require(name.isNotBlank()) { "name is required" }
        require(apiVersion > 0) { "apiVersion must be positive" }
        require(protocolVersion > 0) { "protocolVersion must be positive" }
        require(backendInstanceId.isNotBlank()) { "backendInstanceId is required" }
        require(backendVersion.isNotBlank()) { "backendVersion is required" }
        require(backendBuild.isNotBlank()) { "backendBuild is required" }
        require(status.isNotBlank()) { "status is required" }
    }
}
