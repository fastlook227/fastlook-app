import serial
import time
import re
from collections import deque

import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation

# CONFIGURACIÓN
PUERTO = "COM11"
BAUDIOS = 115200
MAX_MUESTRAS = 100

tiempos = deque(maxlen=MAX_MUESTRAS)
entradas = deque(maxlen=MAX_MUESTRAS)
salidas = deque(maxlen=MAX_MUESTRAS)
ideales = deque(maxlen=MAX_MUESTRAS)

# CONEXIÓN ESP32
try:
    esp32 = serial.Serial(
        PUERTO,
        BAUDIOS,
        timeout=0.05
    )
    time.sleep(2)
    esp32.reset_input_buffer()
    print("ESP32 conectado en", PUERTO)
except serial.SerialException as e:
    print("Error de conexión:", e)
    raise SystemExit

# GRÁFICA
plt.style.use("dark_background")

fig, ax = plt.subplots(figsize=(12, 6))
fig.canvas.manager.set_window_title(
    "Osciloscopio ESP32 - LM358"
)

linea_entrada, = ax.plot(
    [], [], color="cyan",
    linewidth=2, label="Entrada"
)

linea_salida, = ax.plot(
    [], [], color="red",
    linewidth=2, label="Salida LM358"
)

linea_ideal, = ax.plot(
    [], [], color="yellow",
    linestyle="--",
    linewidth=1.5,
    label="Ganancia ideal x3"
)

ax.set_title("OSCILOSCOPIO ESP32 - LM358")
ax.set_xlabel("Tiempo (s)")
ax.set_ylabel("Voltaje (V)")
ax.set_ylim(0, 3.3)
ax.set_xlim(0, 20)
ax.grid(True, alpha=0.3)
ax.legend(loc="upper left")

texto = ax.text(
    0.98, 0.95, "",
    transform=ax.transAxes,
    ha="right", va="top",
    fontsize=11,
    color="white"
)

inicio = time.monotonic()

patron = re.compile(
    r"Entrada:\s*([\d.]+)\s*V\s*\|\s*"
    r"Salida:\s*([\d.]+)\s*V"
)

def actualizar(frame):
    # Leer datos disponibles
    for _ in range(30):
        if esp32.in_waiting == 0:
            break

        linea = esp32.readline().decode(
            "utf-8", errors="ignore"
        ).strip()

        resultado = patron.search(linea)

        if not resultado:
            continue

        entrada = float(resultado.group(1))
        salida = float(resultado.group(2))
        t = time.monotonic() - inicio

        tiempos.append(t)
        entradas.append(entrada)
        salidas.append(salida)
        ideales.append(entrada * 3)

    if not tiempos:
        return linea_entrada, linea_salida, linea_ideal, texto

    linea_entrada.set_data(tiempos, entradas)
    linea_salida.set_data(tiempos, salidas)
    linea_ideal.set_data(tiempos, ideales)

    ax.set_xlim(
        max(0, tiempos[-1] - 20),
        max(20, tiempos[-1])
    )

    ganancia = (
        salidas[-1] / entradas[-1]
        if entradas[-1] > 0.01 else 0
    )

    texto.set_text(
        f"Entrada: {entradas[-1]:.3f} V\n"
        f"Salida: {salidas[-1]:.3f} V\n"
        f"Ganancia: {ganancia:.2f}x"
    )

    return linea_entrada, linea_salida, linea_ideal, texto

animacion = FuncAnimation(
    fig,
    actualizar,
    interval=100,
    blit=False,
    cache_frame_data=False
)

try:
    plt.tight_layout()
    plt.show()
finally:
    esp32.close()
    print("Puerto serial cerrado.")