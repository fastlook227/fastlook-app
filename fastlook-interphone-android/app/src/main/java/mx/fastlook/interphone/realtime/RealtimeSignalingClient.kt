package mx.fastlook.interphone.realtime

import android.util.Log
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.websocket.WebSockets
import io.ktor.client.plugins.websocket.webSocket
import io.ktor.http.URLProtocol
import io.ktor.http.path
import io.ktor.websocket.Frame
import io.ktor.websocket.readBytes
import io.ktor.websocket.readText
import kotlinx.coroutines.*
import kotlinx.serialization.json.*
import mx.fastlook.interphone.BuildConfig
import mx.fastlook.interphone.model.UserPresence
import java.util.concurrent.atomic.AtomicLong

interface SignalingListener {
    fun onConnected(); fun onDisconnected(); fun onPresence(users: List<UserPresence>)
    fun onOffer(origin: String, sdp: String); fun onAnswer(origin: String, sdp: String)
    fun onIceCandidate(origin: String, sdpMid: String?, sdpMLineIndex: Int, candidate: String)
    fun onPttStart(userId: String); fun onPttStop(userId: String)
}

class RealtimeSignalingClient(private val scope: CoroutineScope, private val listener: SignalingListener) {
    private val client = HttpClient(OkHttp) { install(WebSockets) { pingIntervalMillis = 20_000 } }
    private val json = Json { ignoreUnknownKeys = true }
    private val refs = AtomicLong(1)
    private var job: Job? = null
    private var send: (suspend (String) -> Unit)? = null
    private var sendBinary: (suspend (ByteArray) -> Unit)? = null
    private val presence = mutableMapOf<String, JsonObject>()
    private val topic = "realtime:interphone:bodega"
    private var activeJoinRef: String? = null
    private var pendingTrackRef: String? = null
    private var reconnectDelayMs = 1_000L
    private var selfId: String? = null

    fun connect(token: String, self: UserPresence) {
        disconnect()
        selfId = self.id
        job = scope.launch(Dispatchers.IO) {
            while (isActive) try {
                val endpoint = BuildConfig.SUPABASE_URL.removePrefix("https://").removePrefix("http://")
                client.webSocket({ url { protocol = URLProtocol.WSS; host = endpoint; path("realtime/v1/websocket"); parameters.append("apikey", BuildConfig.SUPABASE_PUBLISHABLE_KEY); parameters.append("vsn", "2.0.0") } }) {
                    log("WebSocket open; topic=$topic")
                    send = { outgoing.send(Frame.Text(it)) }
                    sendBinary = { outgoing.send(Frame.Binary(true, it)) }
                    val joinRef = refs.getAndIncrement().toString()
                    sendFrame("phx_join", buildJsonObject {
                        put("config", buildJsonObject {
                            put("broadcast", buildJsonObject { put("ack", false); put("self", false) })
                            put("presence", buildJsonObject { put("key", self.id); put("enabled", true) })
                            put("postgres_changes", JsonArray(emptyList()))
                            put("private", false)
                        })
                        put("access_token", token)
                    }, joinRef, joinRef = joinRef)
                    launch { while (isActive) { delay(25_000); sendFrame("heartbeat", JsonObject(emptyMap()), refs.getAndIncrement().toString(), "phoenix", joinRef = null) } }
                    for (frame in incoming) when (frame) {
                        is Frame.Text -> consumeText(frame.readText(), joinRef, self)
                        is Frame.Binary -> consumeBinary(frame.readBytes())
                        else -> Unit
                    }
                }
                listener.onDisconnected()
                send = null; sendBinary = null; activeJoinRef = null; pendingTrackRef = null; presence.clear()
                delay(reconnectDelayMs); reconnectDelayMs = (reconnectDelayMs * 2).coerceAtMost(15_000)
            } catch (error: CancellationException) { throw error }
            catch (error: Exception) {
                Log.w("InterphoneRealtime", "Realtime disconnected: ${error.javaClass.simpleName}")
                send = null; sendBinary = null; activeJoinRef = null; pendingTrackRef = null; presence.clear()
                listener.onDisconnected(); delay(reconnectDelayMs); reconnectDelayMs = (reconnectDelayMs * 2).coerceAtMost(15_000)
            }
        }
    }

    fun disconnect() { job?.cancel(); job = null; send = null; sendBinary = null; activeJoinRef = null; pendingTrackRef = null; presence.clear(); selfId = null }
    fun broadcast(event: String, payload: JsonObject) { scope.launch { sendBroadcast(event, payload, refs.getAndIncrement().toString()) } }

    private suspend fun sendFrame(event: String, payload: JsonObject, ref: String, destination: String = topic, joinRef: String? = activeJoinRef) {
        send?.invoke(JsonArray(listOf(joinRef?.let(::JsonPrimitive) ?: JsonNull, JsonPrimitive(ref), JsonPrimitive(destination), JsonPrimitive(event), payload)).toString())
    }
    private suspend fun sendBroadcast(event: String, payload: JsonObject, ref: String) {
        val joinRef = activeJoinRef ?: return
        val join = joinRef.encodeToByteArray(); val reference = ref.encodeToByteArray(); val channel = topic.encodeToByteArray(); val name = event.encodeToByteArray(); val body = payload.toString().encodeToByteArray()
        require(listOf(join, reference, channel, name).all { it.size <= 255 })
        val frame = ByteArray(7 + join.size + reference.size + channel.size + name.size + body.size)
        frame[0] = 3; frame[1] = join.size.toByte(); frame[2] = reference.size.toByte(); frame[3] = channel.size.toByte(); frame[4] = name.size.toByte(); frame[5] = 0; frame[6] = 1
        var offset = 7
        listOf(join, reference, channel, name, body).forEach { bytes -> bytes.copyInto(frame, offset); offset += bytes.size }
        sendBinary?.invoke(frame)
    }
    private suspend fun consumeText(raw: String, joinRef: String, self: UserPresence) {
        val message = runCatching { json.parseToJsonElement(raw).jsonArray }.getOrNull() ?: return
        if (message.size < 5) return
        val ref = message[1].jsonPrimitive.contentOrNull
        val event = message[3].jsonPrimitive.content
        val payload = message[4].jsonObject
        when (event) {
            "phx_reply" -> consumeReply(ref, payload, joinRef, self)
            "presence_state" -> { presence.clear(); payload.forEach { (key, value) -> value.jsonObject["metas"]?.jsonArray?.firstOrNull()?.jsonObject?.let { presence[key] = it } }; log("presence state peers=${presence.keys}"); emitPresence() }
            "presence_diff" -> { payload["leaves"]?.jsonObject?.keys?.forEach(presence::remove); payload["joins"]?.jsonObject?.forEach { (key, value) -> value.jsonObject["metas"]?.jsonArray?.firstOrNull()?.jsonObject?.let { presence[key] = it } }; log("presence diff peers=${presence.keys}"); emitPresence() }
            "broadcast" -> consumeBroadcast(payload)
            "phx_error" -> throw IllegalStateException("channel error")
        }
    }
    private suspend fun consumeReply(ref: String?, payload: JsonObject, joinRef: String, self: UserPresence) {
        val status = payload["status"]?.jsonPrimitive?.contentOrNull
        if (ref == joinRef) {
            log("phx_join reply=$status; topic=$topic")
            if (status != "ok") throw IllegalStateException("phx_join rejected")
            activeJoinRef = joinRef
            val trackRef = refs.getAndIncrement().toString()
            pendingTrackRef = trackRef
            sendFrame("presence", buildJsonObject { put("type", "presence"); put("event", "track"); put("payload", json.encodeToJsonElement(self)) }, trackRef)
        } else if (ref == pendingTrackRef) {
            log("presence track reply=$status; peer=${self.id}")
            if (status != "ok") throw IllegalStateException("presence track rejected")
            pendingTrackRef = null
            reconnectDelayMs = 1_000L
            listener.onConnected()
            if (BuildConfig.DEBUG) sendBroadcast("ping", buildJsonObject { put("origen", self.id) }, refs.getAndIncrement().toString())
        }
    }
    private fun consumeBinary(raw: ByteArray) {
        if (raw.size < 5 || raw[0].toInt() != 4) return
        val topicSize = raw[1].toInt() and 0xff; val eventSize = raw[2].toInt() and 0xff; val metadataSize = raw[3].toInt() and 0xff; val encoding = raw[4].toInt() and 0xff
        var offset = 5
        if (raw.size < offset + topicSize + eventSize + metadataSize) return
        val receivedTopic = raw.decodeToString(offset, offset + topicSize); offset += topicSize
        val event = raw.decodeToString(offset, offset + eventSize); offset += eventSize + metadataSize
        if (receivedTopic != topic || encoding != 1) return
        val payload = runCatching { json.parseToJsonElement(raw.decodeToString(offset, raw.size)).jsonObject }.getOrNull() ?: return
        consumeBroadcast(buildJsonObject { put("type", "broadcast"); put("event", event); put("payload", payload) })
    }
    private fun consumeBroadcast(wrapper: JsonObject) {
        val event = wrapper["event"]?.jsonPrimitive?.content ?: return
        val payload = wrapper["payload"]?.jsonObject ?: return
        val origin = payload["origen"]?.jsonPrimitive?.contentOrNull ?: payload["usuarioId"]?.jsonPrimitive?.contentOrNull ?: return
        if (event in setOf("offer", "answer", "ice-candidate") && payload["destino"]?.jsonPrimitive?.contentOrNull != selfId) return
        log("broadcast received event=$event peer=$origin")
        when (event) {
            "ping" -> Unit
            "offer" -> payload["descripcion"]?.jsonObject?.get("sdp")?.jsonPrimitive?.contentOrNull?.let { listener.onOffer(origin, it) }
            "answer" -> payload["descripcion"]?.jsonObject?.get("sdp")?.jsonPrimitive?.contentOrNull?.let { listener.onAnswer(origin, it) }
            "ice-candidate" -> payload["candidato"]?.jsonObject?.let { c -> listener.onIceCandidate(origin, c["sdpMid"]?.jsonPrimitive?.contentOrNull, c["sdpMLineIndex"]?.jsonPrimitive?.intOrNull ?: 0, c["candidate"]?.jsonPrimitive?.content ?: return) }
            "ptt-start" -> listener.onPttStart(origin)
            "ptt-stop" -> listener.onPttStop(origin)
        }
    }
    private fun emitPresence() = listener.onPresence(presence.values.mapNotNull { runCatching { json.decodeFromJsonElement<UserPresence>(it) }.getOrNull() })
    private fun log(message: String) { if (BuildConfig.DEBUG) Log.d("InterphoneRealtime", message) }
}
