package mx.fastlook.interphone.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

enum class ConnectionState { DISCONNECTED, CONNECTING, CONNECTED, RECONNECTING, ERROR }

@Serializable data class UserPresence(val id: String, val nombre: String, val rol: String, val hablando: Boolean = false, val onlineAt: String = "")
@Serializable data class UserProfile(val id: String, val nombre: String, val rol: String, val activo: Boolean)
@Serializable data class AuthUser(val id: String)
@Serializable data class AuthSession(@SerialName("access_token") val accessToken: String, @SerialName("refresh_token") val refreshToken: String, val user: AuthUser)
@Serializable data class LoginRequest(val email: String, val password: String)

data class InterphoneState(
    val connectionState: ConnectionState = ConnectionState.DISCONNECTED,
    val users: List<UserPresence> = emptyList(),
    val activeSpeakerId: String? = null,
    val isTransmitting: Boolean = false,
    val error: String? = null,
) { val isChannelBusy get() = activeSpeakerId != null && !isTransmitting }

sealed interface ServiceEvent {
    data object Connected : ServiceEvent
    data object Disconnected : ServiceEvent
    data object NetworkLost : ServiceEvent
    data object Reconnecting : ServiceEvent
    data object Stopped : ServiceEvent
    data class Presence(val users: List<UserPresence>) : ServiceEvent
    data class RemoteStarted(val userId: String) : ServiceEvent
    data class RemoteStopped(val userId: String) : ServiceEvent
    data object StartPtt : ServiceEvent
    data object StopPtt : ServiceEvent
    data object PttTimeout : ServiceEvent
}

fun reduce(state: InterphoneState, event: ServiceEvent): InterphoneState = when (event) {
    ServiceEvent.Connected -> state.copy(connectionState = ConnectionState.CONNECTED, isTransmitting = false, activeSpeakerId = null, error = null)
    ServiceEvent.Disconnected, ServiceEvent.NetworkLost -> state.copy(connectionState = ConnectionState.RECONNECTING, isTransmitting = false, activeSpeakerId = null)
    ServiceEvent.Reconnecting -> state.copy(connectionState = ConnectionState.RECONNECTING, isTransmitting = false, activeSpeakerId = null)
    ServiceEvent.Stopped -> InterphoneState()
    is ServiceEvent.Presence -> state.copy(users = event.users)
    is ServiceEvent.RemoteStarted -> state.copy(activeSpeakerId = event.userId, isTransmitting = false)
    is ServiceEvent.RemoteStopped -> if (state.activeSpeakerId == event.userId) state.copy(activeSpeakerId = null) else state
    ServiceEvent.StartPtt -> if (state.connectionState == ConnectionState.CONNECTED && state.activeSpeakerId == null) state.copy(isTransmitting = true) else state
    ServiceEvent.StopPtt, ServiceEvent.PttTimeout -> state.copy(isTransmitting = false, activeSpeakerId = if (state.isTransmitting) null else state.activeSpeakerId)
}

data class IceServerConfig(val urls: List<String>, val username: String? = null, val credential: String? = null)
fun validIceServers(servers: List<IceServerConfig>) = servers.filter { server -> server.urls.isNotEmpty() && server.urls.all { it.startsWith("stun:") || it.startsWith("turn:") || it.startsWith("turns:") } }
