package mx.fastlook.interphone.realtime

import android.util.Log
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.websocket.WebSockets
import io.ktor.client.plugins.websocket.webSocket
import io.ktor.http.URLProtocol
import io.ktor.http.path
import io.ktor.websocket.Frame
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
    private val presence = mutableMapOf<String, JsonObject>()
    private val topic = "realtime:interphone:bodega"

    fun connect(token: String, self: UserPresence) {
        disconnect()
        job = scope.launch(Dispatchers.IO) {
            var delayMs = 1_000L
            while (isActive) try {
                val endpoint = BuildConfig.SUPABASE_URL.removePrefix("https://").removePrefix("http://")
                client.webSocket({ url { protocol = URLProtocol.WSS; host = endpoint; path("realtime/v1/websocket"); parameters.append("apikey", BuildConfig.SUPABASE_PUBLISHABLE_KEY); parameters.append("vsn", "1.0.0") } }) {
                    send = { outgoing.send(Frame.Text(it)) }
                    val joinRef = refs.getAndIncrement().toString()
                    sendFrame("phx_join", buildJsonObject {
                        put("config", buildJsonObject { put("broadcast", buildJsonObject { put("ack", false); put("self", false) }); put("presence", buildJsonObject { put("key", self.id) }); put("private", false) })
                        put("access_token", token)
                    }, joinRef)
                    launch { while (isActive) { delay(25_000); sendFrame("heartbeat", JsonObject(emptyMap()), refs.getAndIncrement().toString(), "phoenix") } }
                    sendFrame("presence", buildJsonObject { put("type", "presence"); put("event", "track"); put("payload", json.encodeToJsonElement(self)) }, refs.getAndIncrement().toString())
                    listener.onConnected(); delayMs = 1_000
                    for (frame in incoming) if (frame is Frame.Text) consume(frame.readText())
                }
            } catch (error: CancellationException) { throw error }
            catch (error: Exception) { Log.w("InterphoneRealtime", "Realtime disconnected: ${error.javaClass.simpleName}"); listener.onDisconnected(); delay(delayMs); delayMs = (delayMs * 2).coerceAtMost(15_000) }
        }
    }

    fun disconnect() { job?.cancel(); job = null; send = null; presence.clear() }
    fun broadcast(event: String, payload: JsonObject) { scope.launch { sendFrame("broadcast", buildJsonObject { put("type", "broadcast"); put("event", event); put("payload", payload) }, refs.getAndIncrement().toString()) } }

    private suspend fun sendFrame(event: String, payload: JsonObject, ref: String, destination: String = topic) {
        send?.invoke(JsonArray(listOf(JsonNull, JsonPrimitive(ref), JsonPrimitive(destination), JsonPrimitive(event), payload)).toString())
    }
    private fun consume(raw: String) {
        val message = runCatching { json.parseToJsonElement(raw).jsonArray }.getOrNull() ?: return
        if (message.size < 5) return
        val event = message[3].jsonPrimitive.content
        val payload = message[4].jsonObject
        when (event) {
            "presence_state" -> { presence.clear(); payload.forEach { (key, value) -> value.jsonObject["metas"]?.jsonArray?.firstOrNull()?.jsonObject?.let { presence[key] = it } }; emitPresence() }
            "presence_diff" -> { payload["leaves"]?.jsonObject?.keys?.forEach(presence::remove); payload["joins"]?.jsonObject?.forEach { (key, value) -> value.jsonObject["metas"]?.jsonArray?.firstOrNull()?.jsonObject?.let { presence[key] = it } }; emitPresence() }
            "broadcast" -> consumeBroadcast(payload)
        }
    }
    private fun consumeBroadcast(wrapper: JsonObject) {
        val event = wrapper["event"]?.jsonPrimitive?.content ?: return
        val payload = wrapper["payload"]?.jsonObject ?: return
        val origin = payload["origen"]?.jsonPrimitive?.contentOrNull ?: payload["usuarioId"]?.jsonPrimitive?.contentOrNull ?: return
        when (event) {
            "offer" -> payload["descripcion"]?.jsonObject?.get("sdp")?.jsonPrimitive?.contentOrNull?.let { listener.onOffer(origin, it) }
            "answer" -> payload["descripcion"]?.jsonObject?.get("sdp")?.jsonPrimitive?.contentOrNull?.let { listener.onAnswer(origin, it) }
            "ice-candidate" -> payload["candidato"]?.jsonObject?.let { c -> listener.onIceCandidate(origin, c["sdpMid"]?.jsonPrimitive?.contentOrNull, c["sdpMLineIndex"]?.jsonPrimitive?.intOrNull ?: 0, c["candidate"]?.jsonPrimitive?.content ?: return) }
            "ptt-start" -> listener.onPttStart(origin)
            "ptt-stop" -> listener.onPttStop(origin)
        }
    }
    private fun emitPresence() = listener.onPresence(presence.values.mapNotNull { runCatching { json.decodeFromJsonElement<UserPresence>(it) }.getOrNull() })
}
