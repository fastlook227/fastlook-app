package mx.fastlook.interphone.webrtc

import android.content.Context
import android.media.AudioManager
import android.util.Log
import kotlinx.serialization.json.*
import mx.fastlook.interphone.model.IceServerConfig
import mx.fastlook.interphone.model.validIceServers
import org.webrtc.*
import org.webrtc.audio.JavaAudioDeviceModule

interface WebRtcEvents { fun send(event: String, payload: JsonObject); fun onPeerState(peerId: String, state: PeerConnection.PeerConnectionState) }

class WebRtcAudioEngine(context: Context, servers: List<IceServerConfig>, private val selfId: String, private val events: WebRtcEvents) {
    private val appContext = context.applicationContext
    private val egl = EglBase.create()
    private val factory: PeerConnectionFactory
    private val audioSource: AudioSource
    private val audioTrack: AudioTrack
    private val peers = mutableMapOf<String, PeerConnection>()
    private val iceServers: List<PeerConnection.IceServer> = validIceServers(servers).map { server -> PeerConnection.IceServer.builder(server.urls).setUsername(server.username ?: "").setPassword(server.credential ?: "").createIceServer() }
    private val audioManager = appContext.getSystemService(AudioManager::class.java)
    private var previousMode = AudioManager.MODE_NORMAL

    init {
        PeerConnectionFactory.initialize(PeerConnectionFactory.InitializationOptions.builder(appContext).createInitializationOptions())
        factory = PeerConnectionFactory.builder().setOptions(PeerConnectionFactory.Options()).setAudioDeviceModule(JavaAudioDeviceModule.builder(appContext).createAudioDeviceModule()).createPeerConnectionFactory()
        audioSource = factory.createAudioSource(MediaConstraints())
        audioTrack = factory.createAudioTrack("fastlook-audio", audioSource).apply { setEnabled(false) }
    }
    fun startAudioMode() { previousMode = audioManager.mode; audioManager.mode = AudioManager.MODE_IN_COMMUNICATION; audioManager.isSpeakerphoneOn = true }
    fun setTransmitting(enabled: Boolean) { audioTrack.setEnabled(enabled); Log.i("InterphoneWebRTC", "PTT ${if (enabled) "start" else "stop"}") }
    fun createOffer(peerId: String) { val peer = peer(peerId); peer.createOffer(sdpObserver { offer -> peer.setLocalDescription(sdpObserver(), offer); events.send("offer", description(peerId, offer)) }, MediaConstraints()) }
    fun receiveOffer(peerId: String, sdp: String) { val peer = peer(peerId); peer.setRemoteDescription(sdpObserver { peer.createAnswer(sdpObserver { answer -> peer.setLocalDescription(sdpObserver(), answer); events.send("answer", description(peerId, answer)) }, MediaConstraints()) }, SessionDescription(SessionDescription.Type.OFFER, sdp)) }
    fun receiveAnswer(peerId: String, sdp: String) = peer(peerId).setRemoteDescription(sdpObserver(), SessionDescription(SessionDescription.Type.ANSWER, sdp))
    fun addIce(peerId: String, mid: String?, index: Int, candidate: String) { peer(peerId).addIceCandidate(IceCandidate(mid, index, candidate)) }
    fun removePeer(peerId: String) { peers.remove(peerId)?.dispose() }
    fun stop() { setTransmitting(false); peers.values.forEach(PeerConnection::dispose); peers.clear(); audioTrack.dispose(); audioSource.dispose(); factory.dispose(); egl.release(); audioManager.mode = previousMode; audioManager.isSpeakerphoneOn = false }
    private fun peer(peerId: String) = peers.getOrPut(peerId) {
        val config = PeerConnection.RTCConfiguration(iceServers).apply { sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN }
        factory.createPeerConnection(config, object : PeerConnection.Observer {
            override fun onIceCandidate(c: IceCandidate) = events.send("ice-candidate", buildJsonObject { put("origen", selfId); put("destino", peerId); put("candidato", buildJsonObject { put("candidate", c.sdp); put("sdpMid", c.sdpMid); put("sdpMLineIndex", c.sdpMLineIndex) }) })
            override fun onConnectionChange(state: PeerConnection.PeerConnectionState) = events.onPeerState(peerId, state)
            override fun onTrack(transceiver: RtpTransceiver?) { transceiver?.receiver?.track()?.setEnabled(true) }
            override fun onSignalingChange(state: PeerConnection.SignalingState?) {}; override fun onIceConnectionChange(state: PeerConnection.IceConnectionState?) {}; override fun onIceConnectionReceivingChange(receiving: Boolean) {}; override fun onIceGatheringChange(state: PeerConnection.IceGatheringState?) {}; override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>?) {}; override fun onAddStream(stream: MediaStream?) {}; override fun onRemoveStream(stream: MediaStream?) {}; override fun onDataChannel(channel: DataChannel?) {}; override fun onRenegotiationNeeded() {}; override fun onAddTrack(receiver: RtpReceiver?, streams: Array<out MediaStream>?) {}
        })!!.also { it.addTrack(audioTrack, listOf("fastlook-stream")) }
    }
    private fun description(peerId: String, sdp: SessionDescription) = buildJsonObject { put("origen", selfId); put("destino", peerId); put("descripcion", buildJsonObject { put("type", sdp.type.canonicalForm()); put("sdp", sdp.description) }) }
    private fun sdpObserver(success: ((SessionDescription) -> Unit)? = null) = object : SdpObserver { override fun onCreateSuccess(sdp: SessionDescription) { success?.invoke(sdp) }; override fun onSetSuccess() {}; override fun onCreateFailure(error: String?) { Log.w("InterphoneWebRTC", "SDP create failure") }; override fun onSetFailure(error: String?) { Log.w("InterphoneWebRTC", "SDP set failure") } }
}
