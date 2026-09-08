package mx.fastlook.interphone.service

import android.app.*
import android.content.*
import android.content.pm.ServiceInfo
import android.media.*
import android.net.*
import android.os.*
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import mx.fastlook.interphone.BuildConfig
import mx.fastlook.interphone.MainActivity
import mx.fastlook.interphone.model.*
import mx.fastlook.interphone.realtime.*
import mx.fastlook.interphone.webrtc.*
import org.webrtc.PeerConnection

class InterphoneService : Service(), SignalingListener, WebRtcEvents {
    companion object {
        const val ACTION_START = "mx.fastlook.interphone.START"
        const val ACTION_STOP = "mx.fastlook.interphone.STOP"
        const val ACTION_PTT_TOGGLE = "mx.fastlook.interphone.PTT_TOGGLE"
        const val ACTION_PTT_START = "mx.fastlook.interphone.PTT_START"
        const val ACTION_PTT_STOP = "mx.fastlook.interphone.PTT_STOP"
        const val EXTRA_TOKEN = "token"; const val EXTRA_ID = "id"; const val EXTRA_NAME = "name"; const val EXTRA_ROLE = "role"
        private const val CHANNEL_ID = "fastlook_interphone"; private const val NOTIFICATION_ID = 4102
        private val mutableState = MutableStateFlow(InterphoneState())
        val state = mutableState.asStateFlow()
        fun intent(context: Context, action: String) = Intent(context, InterphoneService::class.java).setAction(action)
    }
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private lateinit var signaling: RealtimeSignalingClient
    private var webRtc: WebRtcAudioEngine? = null
    private var user: UserPresence? = null
    private var token: String? = null
    private var timeoutJob: Job? = null
    private var networkCallback: ConnectivityManager.NetworkCallback? = null
    private var audioFocus: AudioFocusRequest? = null

    override fun onCreate() { super.onCreate(); createChannel(); signaling = RealtimeSignalingClient(serviceScope, this); registerNetwork() }
    override fun onBind(intent: Intent?) = null
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> start(intent)
            ACTION_STOP -> stopRadio()
            ACTION_PTT_TOGGLE -> if (mutableState.value.isTransmitting) stopPtt() else startPtt(true)
            ACTION_PTT_START -> startPtt(false)
            ACTION_PTT_STOP -> stopPtt()
        }
        return START_NOT_STICKY
    }
    private fun start(intent: Intent) {
        if (user != null) return
        token = intent.getStringExtra(EXTRA_TOKEN)
        val id = intent.getStringExtra(EXTRA_ID); val name = intent.getStringExtra(EXTRA_NAME); val role = intent.getStringExtra(EXTRA_ROLE)
        if (token.isNullOrBlank() || id.isNullOrBlank() || name.isNullOrBlank() || role !in setOf("Admin", "Vendedor")) { mutableState.value = InterphoneState(error = "Sesión inválida."); stopSelf(); return }
        user = UserPresence(id, name, role!!, false, java.time.Instant.now().toString())
        mutableState.value = mutableState.value.copy(connectionState = ConnectionState.CONNECTING)
        startForegroundSafe(); requestAudioFocus()
        webRtc = WebRtcAudioEngine(this, listOf(IceServerConfig(listOf(BuildConfig.INTERPHONE_STUN_URL))), id, this).also { it.startAudioMode(); it.setTransmitting(false) }
        signaling.connect(token!!, user!!)
    }
    private fun startPtt(timed: Boolean) {
        val current = mutableState.value
        if (current.connectionState != ConnectionState.CONNECTED || current.isChannelBusy || current.isTransmitting) return
        mutableState.value = reduce(current, ServiceEvent.StartPtt); webRtc?.setTransmitting(true); signaling.broadcast("ptt-start", buildJsonObject { put("usuarioId", user!!.id) })
        timeoutJob?.cancel(); if (timed) timeoutJob = serviceScope.launch { delay(30_000); stopPtt() }
        updateNotification()
    }
    private fun stopPtt() {
        val was = mutableState.value.isTransmitting
        timeoutJob?.cancel(); timeoutJob = null; webRtc?.setTransmitting(false)
        mutableState.value = reduce(mutableState.value, ServiceEvent.StopPtt)
        if (was) user?.let { signaling.broadcast("ptt-stop", buildJsonObject { put("usuarioId", it.id) }) }
        updateNotification()
    }
    private fun stopRadio() { stopPtt(); signaling.disconnect(); webRtc?.stop(); webRtc = null; abandonAudioFocus(); mutableState.value = reduce(mutableState.value, ServiceEvent.Stopped); stopForeground(STOP_FOREGROUND_REMOVE); stopSelf() }
    override fun onDestroy() { stopPtt(); signaling.disconnect(); webRtc?.stop(); abandonAudioFocus(); networkCallback?.let { runCatching { getSystemService(ConnectivityManager::class.java).unregisterNetworkCallback(it) } }; serviceScope.cancel(); mutableState.value = InterphoneState(); super.onDestroy() }

    override fun onConnected() { serviceScope.launch { mutableState.value = reduce(mutableState.value, ServiceEvent.Connected); updateNotification() } }
    override fun onDisconnected() { serviceScope.launch { stopPtt(); webRtc?.let { engine -> mutableState.value.users.forEach { engine.removePeer(it.id) } }; mutableState.value = reduce(mutableState.value, ServiceEvent.Disconnected).copy(users = emptyList()); updateNotification() } }
    override fun onPresence(users: List<UserPresence>) { serviceScope.launch { val self = user ?: return@launch; val previous = mutableState.value.users.map { it.id }.toSet(); mutableState.value = reduce(mutableState.value, ServiceEvent.Presence(users)); users.filter { it.id != self.id && it.id !in previous && self.id < it.id }.forEach { webRtc?.createOffer(it.id) } } }
    override fun onOffer(origin: String, sdp: String) { webRtc?.receiveOffer(origin, sdp) }
    override fun onAnswer(origin: String, sdp: String) { webRtc?.receiveAnswer(origin, sdp) }
    override fun onIceCandidate(origin: String, sdpMid: String?, sdpMLineIndex: Int, candidate: String) { webRtc?.addIce(origin, sdpMid, sdpMLineIndex, candidate) }
    override fun onPttStart(userId: String) { serviceScope.launch { val self = user?.id ?: return@launch; if (userId == self) return@launch; if (mutableState.value.isTransmitting && self < userId) { signaling.broadcast("ptt-start", buildJsonObject { put("usuarioId", self) }); return@launch }; stopPtt(); mutableState.value = reduce(mutableState.value, ServiceEvent.RemoteStarted(userId)); updateNotification() } }
    override fun onPttStop(userId: String) { serviceScope.launch { mutableState.value = reduce(mutableState.value, ServiceEvent.RemoteStopped(userId)); updateNotification() } }
    override fun send(event: String, payload: JsonObject) = signaling.broadcast(event, payload)
    override fun onPeerState(peerId: String, state: PeerConnection.PeerConnectionState) { android.util.Log.i("InterphoneService", "Peer $peerId: $state") }

    private fun registerNetwork() {
        val manager = getSystemService(ConnectivityManager::class.java)
        networkCallback = object : ConnectivityManager.NetworkCallback() {
            override fun onLost(network: Network) { serviceScope.launch { stopPtt(); mutableState.value = reduce(mutableState.value, ServiceEvent.NetworkLost); updateNotification() } }
            override fun onAvailable(network: Network) { val currentUser = user ?: return; val currentToken = token ?: return; serviceScope.launch { stopPtt(); webRtc?.let { engine -> mutableState.value.users.forEach { engine.removePeer(it.id) } }; mutableState.value = reduce(mutableState.value, ServiceEvent.Reconnecting).copy(users = emptyList()); signaling.connect(currentToken, currentUser); updateNotification() } }
        }.also { manager.registerDefaultNetworkCallback(it) }
    }
    private fun requestAudioFocus() { val manager = getSystemService(AudioManager::class.java); audioFocus = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK).setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()).setOnAudioFocusChangeListener { if (it <= AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) stopPtt() }.build().also(manager::requestAudioFocus) }
    private fun abandonAudioFocus() { audioFocus?.let { getSystemService(AudioManager::class.java).abandonAudioFocusRequest(it) }; audioFocus = null }
    private fun createChannel() { getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel(CHANNEL_ID, "Fast Look Interphone", NotificationManager.IMPORTANCE_LOW).apply { description = "Radio interno activo"; setSound(null, null) }) }
    private fun startForegroundSafe() { val notification = notification(); ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE) }
    private fun updateNotification() = getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, notification())
    private fun notification(): Notification {
        val state = mutableState.value
        val open = PendingIntent.getActivity(this, 1, Intent(this, MainActivity::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val toggleAction = PendingIntent.getService(this, 2, intent(this, ACTION_PTT_TOGGLE), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val stopAction = PendingIntent.getService(this, 3, intent(this, ACTION_STOP), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val text = when { state.isTransmitting -> "Bodega · TRANSMITIENDO (máx. 30 s)"; state.isChannelBusy -> "Bodega · Canal ocupado"; else -> "Bodega · ${state.connectionState.name.lowercase().replaceFirstChar(Char::uppercase)}" }
        return NotificationCompat.Builder(this, CHANNEL_ID).setSmallIcon(android.R.drawable.ic_btn_speak_now).setContentTitle("Fast Look Interphone").setContentText(text).setContentIntent(open).setOngoing(true).setSilent(true)
            .addAction(0, if (state.isTransmitting) "DETENER" else "HABLAR 30 S", toggleAction).addAction(0, "DESCONECTAR", stopAction).build()
    }
}
