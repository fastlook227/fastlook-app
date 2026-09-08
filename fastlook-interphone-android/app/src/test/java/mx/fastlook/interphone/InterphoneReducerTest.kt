package mx.fastlook.interphone

import mx.fastlook.interphone.model.*
import org.junit.Assert.*
import org.junit.Test

class InterphoneReducerTest {
    @Test fun initialDoesNotTransmit() = assertFalse(InterphoneState().isTransmitting)
    @Test fun startPtt() = assertTrue(reduce(InterphoneState(ConnectionState.CONNECTED), ServiceEvent.StartPtt).isTransmitting)
    @Test fun stopPtt() = assertFalse(reduce(InterphoneState(ConnectionState.CONNECTED, isTransmitting = true), ServiceEvent.StopPtt).isTransmitting)
    @Test fun busyChannelBlocksPtt() = assertFalse(reduce(InterphoneState(ConnectionState.CONNECTED, activeSpeakerId = "remote"), ServiceEvent.StartPtt).isTransmitting)
    @Test fun disconnectForcesStop() = assertFalse(reduce(InterphoneState(ConnectionState.CONNECTED, isTransmitting = true), ServiceEvent.Disconnected).isTransmitting)
    @Test fun timeoutForcesStop() = assertFalse(reduce(InterphoneState(ConnectionState.CONNECTED, isTransmitting = true), ServiceEvent.PttTimeout).isTransmitting)
    @Test fun stoppedReleasesState() = assertEquals(InterphoneState(), reduce(InterphoneState(ConnectionState.CONNECTED, isTransmitting = true), ServiceEvent.Stopped))
    @Test fun networkChangeIsSafe() = assertEquals(ConnectionState.RECONNECTING, reduce(InterphoneState(ConnectionState.CONNECTED, isTransmitting = true), ServiceEvent.NetworkLost).connectionState)
    @Test fun reconnectNeverStartsPtt() = assertFalse(reduce(InterphoneState(isTransmitting = true), ServiceEvent.Connected).isTransmitting)
    @Test fun remoteSpeakerBlocksLocal() = assertFalse(reduce(reduce(InterphoneState(ConnectionState.CONNECTED), ServiceEvent.RemoteStarted("2")), ServiceEvent.StartPtt).isTransmitting)
    @Test fun presenceMapsToUiState() { val users = listOf(UserPresence("1", "Enrique", "Admin")); assertEquals(users, reduce(InterphoneState(), ServiceEvent.Presence(users)).users) }
    @Test fun iceAcceptsStunAndTurn() { val result = validIceServers(listOf(IceServerConfig(listOf("stun:a")), IceServerConfig(listOf("turn:b"), "u", "p"), IceServerConfig(listOf("https://bad")))); assertEquals(2, result.size) }
}
