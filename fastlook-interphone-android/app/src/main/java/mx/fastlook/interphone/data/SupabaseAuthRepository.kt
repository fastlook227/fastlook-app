package mx.fastlook.interphone.data

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json
import mx.fastlook.interphone.BuildConfig
import mx.fastlook.interphone.model.*

class SupabaseAuthRepository(private val sessions: SessionStore) {
    private val json = Json { ignoreUnknownKeys = true }
    private val client = HttpClient(OkHttp) { install(ContentNegotiation) { json(json) } }
    suspend fun login(email: String, password: String): UserProfile {
        checkConfig()
        val session: AuthSession = client.post("${BuildConfig.SUPABASE_URL}/auth/v1/token?grant_type=password") {
            contentType(ContentType.Application.Json); header("apikey", BuildConfig.SUPABASE_PUBLISHABLE_KEY); setBody(LoginRequest(email, password))
        }.body()
        val profile: List<UserProfile> = client.get("${BuildConfig.SUPABASE_URL}/rest/v1/usuarios") {
            header("apikey", BuildConfig.SUPABASE_PUBLISHABLE_KEY); bearerAuth(session.accessToken)
            parameter("select", "id,nombre,rol,activo"); parameter("id", "eq.${session.user.id}")
        }.body()
        val user = profile.singleOrNull() ?: error("No existe un perfil Fast Look para esta cuenta.")
        require(user.activo && user.rol in setOf("Admin", "Vendedor")) { "Usuario inactivo o sin rol permitido." }
        sessions.save(session.accessToken, session.refreshToken, session.user.id)
        return user
    }
    suspend fun restore(): UserProfile? {
        val accessToken = sessions.accessToken() ?: return null
        val id = sessions.userId() ?: return null
        return runCatching { loadProfile(accessToken, id) }.getOrNull()?.takeIf { it.activo && it.rol in setOf("Admin", "Vendedor") }
    }
    suspend fun token() = sessions.accessToken() ?: error("La sesión expiró. Inicia sesión nuevamente.")
    suspend fun logout() = sessions.clear()
    private fun checkConfig() = require(BuildConfig.SUPABASE_URL.startsWith("https://") && BuildConfig.SUPABASE_PUBLISHABLE_KEY.isNotBlank()) { "Configura Supabase en local.properties." }
    private suspend fun loadProfile(accessToken: String, id: String): UserProfile? {
        val profiles: List<UserProfile> = client.get("${BuildConfig.SUPABASE_URL}/rest/v1/usuarios") { header("apikey", BuildConfig.SUPABASE_PUBLISHABLE_KEY); bearerAuth(accessToken); parameter("select", "id,nombre,rol,activo"); parameter("id", "eq.$id") }.body()
        return profiles.singleOrNull()
    }
}
