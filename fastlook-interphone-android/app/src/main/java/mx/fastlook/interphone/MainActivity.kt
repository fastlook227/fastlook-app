package mx.fastlook.interphone

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Build
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import mx.fastlook.interphone.data.*
import mx.fastlook.interphone.model.*
import mx.fastlook.interphone.service.InterphoneService

class MainActivity : ComponentActivity() {
    private lateinit var sessions: SessionStore
    private lateinit var auth: SupabaseAuthRepository
    override fun onCreate(savedInstanceState: Bundle?) { super.onCreate(savedInstanceState); sessions = SessionStore(this); auth = SupabaseAuthRepository(sessions); setContent { FastLookTheme { InterphoneApp() } } }

    @Composable private fun InterphoneApp() {
        var profile by remember { mutableStateOf<UserProfile?>(null) }
        var email by remember { mutableStateOf("") }; var password by remember { mutableStateOf("") }; var error by remember { mutableStateOf<String?>(null) }; var loading by remember { mutableStateOf(false) }; var restoring by remember { mutableStateOf(true) }
        val scope = rememberCoroutineScope(); val radio by InterphoneService.state.collectAsStateWithLifecycle()
        LaunchedEffect(Unit) { profile = auth.restore(); restoring = false }
        val permissions = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { results -> if (results[Manifest.permission.RECORD_AUDIO] == true || ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) profile?.let(::startRadio) else error = "El permiso de micrófono es obligatorio para activar el radio." }
        if (restoring) Surface(Modifier.fillMaxSize(), color = Color(0xFF101319)) { Box(contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Color(0xFFC8202F)) } }
        else if (profile == null) LoginScreen(email, password, loading, error, { email = it }, { password = it }) { scope.launch { loading = true; error = null; runCatching { auth.login(email.trim(), password) }.onSuccess { profile = it }.onFailure { error = it.message ?: "No fue posible iniciar sesión." }; password = ""; loading = false } }
        else RadioScreen(profile!!, radio, error, onActivate = {
            val missing = buildList { if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) add(Manifest.permission.RECORD_AUDIO); if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) add(Manifest.permission.POST_NOTIFICATIONS) }
            if (missing.isEmpty()) startRadio(profile!!) else permissions.launch(missing.toTypedArray())
        }, onDeactivate = { startService(InterphoneService.intent(this, InterphoneService.ACTION_STOP)) }, onPress = { startService(InterphoneService.intent(this, InterphoneService.ACTION_PTT_START)) }, onRelease = { startService(InterphoneService.intent(this, InterphoneService.ACTION_PTT_STOP)) }, onLogout = { startService(InterphoneService.intent(this, InterphoneService.ACTION_STOP)); scope.launch { auth.logout(); profile = null } })
    }
    private fun startRadio(profile: UserProfile) { lifecycleScope.launch { val token = auth.token(); val intent = InterphoneService.intent(this@MainActivity, InterphoneService.ACTION_START).putExtra(InterphoneService.EXTRA_TOKEN, token).putExtra(InterphoneService.EXTRA_ID, profile.id).putExtra(InterphoneService.EXTRA_NAME, profile.nombre).putExtra(InterphoneService.EXTRA_ROLE, profile.rol); ContextCompat.startForegroundService(this@MainActivity, intent) } }
}

@Composable private fun LoginScreen(email: String, password: String, loading: Boolean, error: String?, onEmail: (String) -> Unit, onPassword: (String) -> Unit, onLogin: () -> Unit) = Surface(Modifier.fillMaxSize(), color = Color(0xFF101319)) { Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.Center) { Text("FAST LOOK", color = Color.White, style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Black); Text("INTERPHONE", color = Color(0xFFE12B3B), style = MaterialTheme.typography.headlineMedium); Spacer(Modifier.height(28.dp)); OutlinedTextField(email, onEmail, Modifier.fillMaxWidth(), label = { Text("Correo") }, singleLine = true); OutlinedTextField(password, onPassword, Modifier.fillMaxWidth(), label = { Text("Contraseña") }, singleLine = true, visualTransformation = PasswordVisualTransformation()); error?.let { Text(it, color = Color(0xFFFF8992), modifier = Modifier.padding(vertical = 8.dp)) }; Button(onClick = onLogin, enabled = !loading && email.isNotBlank() && password.isNotBlank(), modifier = Modifier.fillMaxWidth().height(54.dp), colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFC8202F))) { Text(if (loading) "ENTRANDO…" else "INICIAR SESIÓN") } } }

@Composable private fun RadioScreen(profile: UserProfile, state: InterphoneState, error: String?, onActivate: () -> Unit, onDeactivate: () -> Unit, onPress: () -> Unit, onRelease: () -> Unit, onLogout: () -> Unit) = Surface(Modifier.fillMaxSize(), color = Color(0xFF101319)) { Column(Modifier.fillMaxSize().systemBarsPadding().padding(18.dp), horizontalAlignment = Alignment.CenterHorizontally) { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Column { Text("FAST LOOK · INTERPHONE", color = Color.White, fontWeight = FontWeight.Black); Text("${profile.nombre} · ${profile.rol}", color = Color.Gray) }; TextButton(onClick = onLogout) { Text("Salir", color = Color(0xFFFF6A76)) } }; Spacer(Modifier.height(18.dp)); Text("CANAL", color = Color.Gray); Text("BODEGA", color = Color.White, style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Black); Text(statusText(state), color = if (state.connectionState == ConnectionState.CONNECTED) Color(0xFF36D68B) else Color(0xFFFFC85A), fontWeight = FontWeight.Bold); error?.let { Text(it, color = Color(0xFFFF8992)) }; Spacer(Modifier.height(12.dp)); LazyColumn(Modifier.fillMaxWidth().weight(1f)) { items(state.users, key = { it.id }) { user -> Text("●  ${user.nombre} · ${user.rol}${if (state.activeSpeakerId == user.id) "  HABLANDO" else ""}", color = if (state.activeSpeakerId == user.id) Color(0xFFFF6571) else Color.White, modifier = Modifier.padding(7.dp)) } }; if (state.connectionState == ConnectionState.DISCONNECTED) Button(onClick = onActivate, colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFC8202F))) { Text("ACTIVAR RADIO") } else { Box(Modifier.size(210.dp).background(if (state.isTransmitting) Color(0xFFFF3445) else if (state.isChannelBusy) Color.DarkGray else Color(0xFFC8202F), CircleShape).pointerInput(state.connectionState, state.isChannelBusy) { detectTapGestures(onPress = { if (state.connectionState == ConnectionState.CONNECTED && !state.isChannelBusy) { onPress(); tryAwaitRelease(); onRelease() } }) }, contentAlignment = Alignment.Center) { Text(if (state.isTransmitting) "TRANSMITIENDO…" else if (state.isChannelBusy) "CANAL\nOCUPADO" else "MANTENER\nPARA HABLAR", color = Color.White, fontWeight = FontWeight.Black) }; TextButton(onClick = onDeactivate) { Text("DESACTIVAR RADIO", color = Color(0xFFFF6A76)) } } } }
private fun statusText(state: InterphoneState) = when { state.isTransmitting -> "TRANSMITIENDO"; state.isChannelBusy -> "CANAL OCUPADO"; else -> state.connectionState.name }
@Composable private fun FastLookTheme(content: @Composable () -> Unit) = MaterialTheme(colorScheme = darkColorScheme(primary = Color(0xFFC8202F)), content = content)
