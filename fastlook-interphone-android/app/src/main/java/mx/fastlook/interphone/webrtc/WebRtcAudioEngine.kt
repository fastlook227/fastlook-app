package mx.fastlook.interphone.webrtc

import android.content.Context
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
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
    private val audioDeviceModule: JavaAudioDeviceModule
    private val audioSource: AudioSource
    private val audioTrack: AudioTrack
    private val peers = mutableMapOf<String, PeerConnection>()
    private val offerRequested = mutableSetOf<String>()
    private val makingOffer = mutableSetOf<String>()
    private val negotiated = mutableSetOf<String>()
    private val ignoredOffers = mutableSetOf<String>()
    private val pendingIce = mutableMapOf<String, MutableList<IceCandidate>>()
    private val iceServers: List<PeerConnection.IceServer> = validIceServers(servers).map { server -> PeerConnection.IceServer.builder(server.urls).setUsername(server.username ?: "").setPassword(server.credential ?: "").createIceServer() }
    private val audioManager = appContext.getSystemService(AudioManager::class.java)
    private var previousMode = AudioManager.MODE_NORMAL
    private var previousSpeakerphone = false
    private var previousCommunicationDevice: AudioDeviceInfo? = null
    private val statsHandler = Handler(Looper.getMainLooper())
    private val statsTask = object : Runnable {
        override fun run() { peers.forEach { (peerId, peer) -> logStats(peerId, peer) }; if (peers.isNotEmpty()) statsHandler.postDelayed(this, 2_000) }
    }

    init {
        PeerConnectionFactory.initialize(PeerConnectionFactory.InitializationOptions.builder(appContext).createInitializationOptions())
        audioDeviceModule = JavaAudioDeviceModule.builder(appContext)
            .setAudioRecordErrorCallback(object : JavaAudioDeviceModule.AudioRecordErrorCallback {
                override fun onWebRtcAudioRecordInitError(errorMessage: String?) { Log.e("InterphoneWebRTC", "recording init error") }
                override fun onWebRtcAudioRecordStartError(errorCode: JavaAudioDeviceModule.AudioRecordStartErrorCode?, errorMessage: String?) { Log.e("InterphoneWebRTC", "recording start error code=$errorCode") }
                override fun onWebRtcAudioRecordError(errorMessage: String?) { Log.e("InterphoneWebRTC", "recording runtime error") }
            })
            .setAudioTrackErrorCallback(object : JavaAudioDeviceModule.AudioTrackErrorCallback {
                override fun onWebRtcAudioTrackInitError(errorMessage: String?) { Log.e("InterphoneWebRTC", "playout init error") }
                override fun onWebRtcAudioTrackStartError(errorCode: JavaAudioDeviceModule.AudioTrackStartErrorCode?, errorMessage: String?) { Log.e("InterphoneWebRTC", "playout start error code=$errorCode") }
                override fun onWebRtcAudioTrackError(errorMessage: String?) { Log.e("InterphoneWebRTC", "playout runtime error") }
            })
            .setAudioRecordStateCallback(object : JavaAudioDeviceModule.AudioRecordStateCallback { override fun onWebRtcAudioRecordStart() { log("recording start") }; override fun onWebRtcAudioRecordStop() { log("recording stop") } })
            .setAudioTrackStateCallback(object : JavaAudioDeviceModule.AudioTrackStateCallback { override fun onWebRtcAudioTrackStart() { log("playout start") }; override fun onWebRtcAudioTrackStop() { log("playout stop") } })
            .createAudioDeviceModule()
        factory = PeerConnectionFactory.builder().setOptions(PeerConnectionFactory.Options()).setAudioDeviceModule(audioDeviceModule).createPeerConnectionFactory()
        audioSource = factory.createAudioSource(MediaConstraints())
        audioTrack = factory.createAudioTrack("fastlook-audio", audioSource).apply { setEnabled(false) }
        logLocalTrack()
    }
    fun startAudioMode() {
        previousMode = audioManager.mode; audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) { previousCommunicationDevice = audioManager.communicationDevice; audioManager.availableCommunicationDevices.firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }?.let(audioManager::setCommunicationDevice) }
        else @Suppress("DEPRECATION") run { previousSpeakerphone = audioManager.isSpeakerphoneOn; audioManager.isSpeakerphoneOn = true }
        log("AUDIO_OUTPUT ${selectedAudioDevice()}")
    }
    fun setTransmitting(enabled: Boolean) { audioTrack.setEnabled(enabled); logLocalTrack() }
    fun createOffer(peerId: String) { statsHandler.post {
        if (peerId in negotiated || !offerRequested.add(peerId)) return@post
        val peer = peer(peerId)
        if (peer.signalingState() != PeerConnection.SignalingState.STABLE) { offerRequested.remove(peerId); return@post }
        makingOffer.add(peerId); log("CREATE_OFFER peer=$peerId"); logTransceivers(peerId, peer)
        peer.createOffer(sdpObserver(onCreate = { offer -> logSdp("offer", peerId, offer.description); peer.setLocalDescription(sdpObserver(onSet = { makingOffer.remove(peerId); offerRequested.remove(peerId); log("SET_LOCAL_OFFER peer=$peerId"); logTransceivers(peerId, peer); events.send("offer", description(peerId, offer)) }, onFailure = { failNegotiation(peerId) }), offer) }, onFailure = { failNegotiation(peerId) }), MediaConstraints())
    } }
    fun receiveOffer(peerId: String, sdp: String) { statsHandler.post {
        val peer = peer(peerId); val collision = peerId in makingOffer || peer.signalingState() != PeerConnection.SignalingState.STABLE; val polite = selfId > peerId
        if (collision) log("NEGOTIATION_COLLISION peer=$peerId polite=$polite state=${peer.signalingState()}")
        if (collision && !polite) { ignoredOffers.add(peerId); return@post }
        ignoredOffers.remove(peerId)
        val applyOffer = {
            log("REMOTE_OFFER peer=$peerId"); logSdp("offer", peerId, sdp)
            peer.setRemoteDescription(sdpObserver(onSet = {
                pendingIce.remove(peerId)?.forEach(peer::addIceCandidate)
                log("CREATE_ANSWER peer=$peerId")
                peer.createAnswer(sdpObserver(onCreate = { answer -> logSdp("answer", peerId, answer.description); peer.setLocalDescription(sdpObserver(onSet = { negotiated.add(peerId); log("SET_LOCAL_ANSWER peer=$peerId"); logTransceivers(peerId, peer); events.send("answer", description(peerId, answer)) }, onFailure = { failNegotiation(peerId) }), answer) }, onFailure = { failNegotiation(peerId) }), MediaConstraints())
            }, onFailure = { failNegotiation(peerId) }), SessionDescription(SessionDescription.Type.OFFER, sdp))
        }
        if (collision) peer.setLocalDescription(sdpObserver(onSet = applyOffer, onFailure = { failNegotiation(peerId) }), SessionDescription(SessionDescription.Type.ROLLBACK, "")) else applyOffer()
    } }
    fun receiveAnswer(peerId: String, sdp: String) { statsHandler.post { val peer = peer(peerId); log("REMOTE_ANSWER peer=$peerId"); logSdp("answer", peerId, sdp); peer.setRemoteDescription(sdpObserver(onSet = { negotiated.add(peerId); pendingIce.remove(peerId)?.forEach(peer::addIceCandidate); logTransceivers(peerId, peer) }, onFailure = { failNegotiation(peerId) }), SessionDescription(SessionDescription.Type.ANSWER, sdp)) } }
    fun addIce(peerId: String, mid: String?, index: Int, candidate: String) { statsHandler.post { if (peerId in ignoredOffers) return@post; val peer = peer(peerId); val ice = IceCandidate(mid, index, candidate); if (peer.remoteDescription != null) peer.addIceCandidate(ice) else pendingIce.getOrPut(peerId) { mutableListOf() }.add(ice) } }
    fun removePeer(peerId: String) { statsHandler.post { closePeer(peerId) } }
    fun stop() { setTransmitting(false); statsHandler.removeCallbacks(statsTask); peers.keys.toList().forEach(::closePeer); audioTrack.dispose(); audioSource.dispose(); factory.dispose(); audioDeviceModule.release(); egl.release(); if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) previousCommunicationDevice?.let(audioManager::setCommunicationDevice) ?: audioManager.clearCommunicationDevice() else @Suppress("DEPRECATION") run { audioManager.isSpeakerphoneOn = previousSpeakerphone }; audioManager.mode = previousMode }
    private fun peer(peerId: String) = peers.getOrPut(peerId) {
        val config = PeerConnection.RTCConfiguration(iceServers).apply { sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN }
        factory.createPeerConnection(config, object : PeerConnection.Observer {
            override fun onIceCandidate(c: IceCandidate) = events.send("ice-candidate", buildJsonObject { put("origen", selfId); put("destino", peerId); put("candidato", buildJsonObject { put("candidate", c.sdp); put("sdpMid", c.sdpMid); put("sdpMLineIndex", c.sdpMLineIndex) }) })
            override fun onConnectionChange(state: PeerConnection.PeerConnectionState) { log("peer=$peerId connectionState=$state"); events.onPeerState(peerId, state) }
            override fun onTrack(transceiver: RtpTransceiver?) { val track = transceiver?.receiver?.track(); track?.setEnabled(true); log("REMOTE_AUDIO_TRACK_RECEIVED peer=$peerId kind=${track?.kind()} enabled=${track?.enabled()} state=${track?.state()}") }
            override fun onSignalingChange(state: PeerConnection.SignalingState?) { log("peer=$peerId signalingState=$state") }; override fun onIceConnectionChange(state: PeerConnection.IceConnectionState?) { log("peer=$peerId iceConnectionState=$state") }; override fun onIceConnectionReceivingChange(receiving: Boolean) { log("peer=$peerId iceReceiving=$receiving") }; override fun onIceGatheringChange(state: PeerConnection.IceGatheringState?) { log("peer=$peerId iceGatheringState=$state") }; override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>?) {}; override fun onAddStream(stream: MediaStream?) {}; override fun onRemoveStream(stream: MediaStream?) {}; override fun onDataChannel(channel: DataChannel?) {}; override fun onRenegotiationNeeded() { log("negotiationneeded peer=$peerId ignored=true") }; override fun onAddTrack(receiver: RtpReceiver?, streams: Array<out MediaStream>?) {}
        })!!.also { peer -> log("PEER_CREATED peer=$peerId"); peer.addTrack(audioTrack, listOf("fastlook-stream")); log("LOCAL_AUDIO_ADDED peer=$peerId"); logTransceivers(peerId, peer); statsHandler.removeCallbacks(statsTask); statsHandler.post(statsTask) }
    }
    private fun description(peerId: String, sdp: SessionDescription) = buildJsonObject { put("origen", selfId); put("destino", peerId); put("descripcion", buildJsonObject { put("type", sdp.type.canonicalForm()); put("sdp", sdp.description) }) }
    private fun sdpObserver(onCreate: ((SessionDescription) -> Unit)? = null, onSet: (() -> Unit)? = null, onFailure: (() -> Unit)? = null) = object : SdpObserver { override fun onCreateSuccess(sdp: SessionDescription) { statsHandler.post { onCreate?.invoke(sdp) } }; override fun onSetSuccess() { statsHandler.post { onSet?.invoke() } }; override fun onCreateFailure(error: String?) { Log.w("InterphoneWebRTC", "SDP create failure"); statsHandler.post { onFailure?.invoke() } }; override fun onSetFailure(error: String?) { Log.w("InterphoneWebRTC", "SDP set failure"); statsHandler.post { onFailure?.invoke() } } }
    private fun failNegotiation(peerId: String) { log("NEGOTIATION_FAILED peer=$peerId"); closePeer(peerId) }
    private fun closePeer(peerId: String) { peers.remove(peerId)?.let { log("PEER_CLOSED peer=$peerId"); it.close(); it.dispose() }; offerRequested.remove(peerId); makingOffer.remove(peerId); negotiated.remove(peerId); ignoredOffers.remove(peerId); pendingIce.remove(peerId) }
    private fun logTransceivers(peerId: String, peer: PeerConnection) { log("TRANSCEIVERS peer=$peerId total=${peer.transceivers.size}"); peer.transceivers.forEach { log("TRANSCEIVER peer=$peerId mid=${it.mid} kind=${it.sender.track()?.kind() ?: it.receiver.track()?.kind()} direction=${it.direction} currentDirection=${it.currentDirection}") } }
    private fun logLocalTrack() = log("LOCAL_AUDIO_TRACK enabled=${audioTrack.enabled()} state=${audioTrack.state()}")
    private fun logSdp(type: String, peerId: String, sdp: String) { val audio = sdp.lineSequence().any { it.startsWith("m=audio") }; val direction = sdp.lineSequence().firstOrNull { it in setOf("a=sendrecv", "a=sendonly", "a=recvonly", "a=inactive") }?.removePrefix("a=") ?: "unknown"; log("$type SDP peer=$peerId audio=$audio direction=$direction") }
    private fun logStats(peerId: String, peer: PeerConnection) = peer.getStats { report -> report.statsMap.values.filter { it.type in setOf("inbound-rtp", "outbound-rtp") && (it.members["kind"] == "audio" || it.members["mediaType"] == "audio") }.forEach { stat -> log("AUDIO_STATS peer=$peerId direction=${stat.type} bytesSent=${stat.members["bytesSent"]} packetsSent=${stat.members["packetsSent"]} bytesReceived=${stat.members["bytesReceived"]} packetsReceived=${stat.members["packetsReceived"]} audioLevel=${stat.members["audioLevel"]}") } }
    @Suppress("DEPRECATION") private fun selectedAudioDevice(): String = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) when (audioManager.communicationDevice?.type) { AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "speaker"; AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> "earpiece"; AudioDeviceInfo.TYPE_BLUETOOTH_SCO, AudioDeviceInfo.TYPE_BLE_HEADSET -> "bluetooth"; AudioDeviceInfo.TYPE_WIRED_HEADSET, AudioDeviceInfo.TYPE_WIRED_HEADPHONES -> "headset"; else -> "unknown" } else if (audioManager.isSpeakerphoneOn) "speaker" else "earpiece"
    private fun log(message: String) = Log.i("InterphoneWebRTC", message)
}
