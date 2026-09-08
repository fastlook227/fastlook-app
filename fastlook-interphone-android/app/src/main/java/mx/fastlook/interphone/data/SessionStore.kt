package mx.fastlook.interphone.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first

private val Context.sessionDataStore by preferencesDataStore("fastlook_session")
class SessionStore(private val context: Context) {
    private val access = stringPreferencesKey("access_token")
    private val refresh = stringPreferencesKey("refresh_token")
    private val userId = stringPreferencesKey("user_id")
    suspend fun save(accessToken: String, refreshToken: String, id: String) = context.sessionDataStore.edit { it[access] = accessToken; it[refresh] = refreshToken; it[userId] = id }
    suspend fun accessToken() = context.sessionDataStore.data.first()[access]
    suspend fun userId() = context.sessionDataStore.data.first()[userId]
    suspend fun clear() = context.sessionDataStore.edit { it.clear() }
}
