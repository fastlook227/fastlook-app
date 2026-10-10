"""Simulación de un circuito RC mediante una ecuación en diferencia.

Modelo continuo:
    RC * dVc(t)/dt + Vc(t) = Vin(t)

Discretización con Euler hacia atrás:
    Vc[n] = alfa * Vc[n-1] + beta * Vin[n]
"""

import matplotlib.pyplot as plt


# Parámetros del circuito y de la simulación
R = 330.0             # ohms
C = 470e-6            # farads
T = 0.1               # periodo de muestreo, segundos
VOLTAJE_ENTRADA = 1.0 # escalón de entrada, volts
DURACION = 2.0        # segundos
VC_INICIAL = 0.0      # voltaje inicial del capacitor, volts


tau = R * C
alfa = tau / (tau + T)
beta = T / (tau + T)

numero_muestras = int(DURACION / T) + 1
tiempos = [n * T for n in range(numero_muestras)]
entrada = [VOLTAJE_ENTRADA for _ in range(numero_muestras)]
vc = [VC_INICIAL]


# El ciclo recursivo comienza en n=1 porque vc[0] es la condición inicial.
for n in range(1, numero_muestras):
    vc_actual = alfa * vc[n - 1] + beta * entrada[n]
    vc.append(vc_actual)


print(f"Constante de tiempo tau = {tau:.4f} s")
print(f"alfa = {alfa:.6f}")
print(f"beta = {beta:.6f}")
print("\n n | tiempo (s) | Vin (V) | Vc (V)")
print("---+------------+---------+--------")

for n, (tiempo, vin, voltaje_capacitor) in enumerate(
    zip(tiempos, entrada, vc)
):
    print(f"{n:2d} | {tiempo:10.2f} | {vin:7.3f} | {voltaje_capacitor:6.4f}")


plt.step(tiempos, entrada, where="post", linestyle="--", label="Entrada Vin[n]")
plt.plot(tiempos, vc, "o-", label="Capacitor Vc[n]")
plt.title("Respuesta discreta de un circuito RC")
plt.xlabel("Tiempo (s)")
plt.ylabel("Voltaje (V)")
plt.grid(True, alpha=0.35)
plt.legend()
plt.tight_layout()
plt.show()
