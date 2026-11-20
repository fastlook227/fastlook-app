"""Genera vistas previas JSON; nunca escribe en Supabase ni modifica los archivos fuente."""
from __future__ import annotations

import argparse, hashlib, json, re
from pathlib import Path
from typing import Any

from openpyxl import load_workbook
from pypdf import PdfReader

NIVELES_AQUILA = (("BASE", 0), ("10%", 10), ("15%", 15), ("20%", 20), ("25%", 25), ("30%", 30))

def dinero(valor: Any) -> float | None:
    if valor in (None, ""): return None
    try: return round(float(str(valor).replace("$", "").replace(",", "").strip()), 2)
    except ValueError: return None

def ambiguo(codigo: str) -> bool:
    return bool(re.search(r"\*|\([^)]*[/,][^)]*\)", codigo))

def sha256(ruta: Path) -> str:
    h = hashlib.sha256()
    with ruta.open("rb") as archivo:
        for bloque in iter(lambda: archivo.read(1024 * 1024), b""): h.update(bloque)
    return h.hexdigest()

def extraer_cedis(ruta: Path) -> list[dict[str, Any]]:
    libro = load_workbook(ruta, data_only=True, read_only=False)
    hoja = libro["Hoja1"]
    imagenes_por_fila: dict[int, str] = {}
    for indice, imagen in enumerate(hoja._images):
        if hasattr(imagen.anchor, "_from") and imagen.anchor._from.col + 1 == 3:
            fila = imagen.anchor._from.row + 1
            imagenes_por_fila[fila] = f"xlsx:Hoja1!C{fila}#image-{indice}"
    niveles = ("MAYOREO", "MAS DE 25 MIL", "MAS DE 50 MIL", "MAS DE 100 MIL", "MAS DE 200 MIL", "MAS DE 300 MIL", "MAS DE 500 MIL", "MAS DE 800 MIL", "MAS DE 1 MILLON")
    registros = []
    for fila in range(10, hoja.max_row + 1):
        codigo, base = hoja.cell(fila, 1).value, dinero(hoja.cell(fila, 9).value)
        if codigo in (None, "") or base is None: continue
        escalas = []
        for nivel, columna in zip(niveles, range(9, 18)):
            costo = dinero(hoja.cell(fila, columna).value)
            if costo is not None: escalas.append({"nivel": nivel, "descuentoPorcentaje": round((1 - costo / base) * 100, 2) if base else 0, "costoEfectivo": costo})
        registros.append({"codigoOriginal": str(codigo).strip(), "codigoBarras": None, "nombre": str(hoja.cell(fila, 4).value or codigo).strip(), "descripcion": str(hoja.cell(fila, 4).value or "").strip(), "categoria": str(hoja.cell(fila, 8).value or "").strip(), "marca": str(hoja.cell(fila, 7).value or "").strip(), "compatibilidades": [str(hoja.cell(fila, 6).value).strip()] if hoja.cell(fila, 6).value else [], "variantes": [], "precioBase": base, "escalas": escalas, "imagenReferencia": imagenes_por_fila.get(fila), "origenPagina": None, "origenFila": fila, "ambiguo": ambiguo(str(codigo))})
    return registros

def extraer_remo(ruta: Path) -> list[dict[str, Any]]:
    lector = PdfReader(str(ruta)); registros = []
    patron = re.compile(r"(?ms)^(K\d+|REM\d+|RANIX\d+|k\d+)\s+(.+?)\s+\$\s*([\d,]+\.\d{2})\s+(\d+)\s*(?=\n|$)")
    for pagina, hoja in enumerate(lector.pages, 1):
        for coincidencia in patron.finditer(hoja.extract_text() or ""):
            codigo, descripcion, precio, existencia = coincidencia.groups()
            descripcion = re.sub(r"\s+", " ", descripcion).strip()
            registros.append({"codigoOriginal": codigo, "codigoBarras": None, "nombre": descripcion, "descripcion": descripcion, "categoria": "", "marca": "", "compatibilidades": [], "variantes": [], "precioBase": dinero(precio), "escalas": [{"nivel": "LISTA", "descuentoPorcentaje": 0, "costoEfectivo": dinero(precio)}], "imagenReferencia": None, "origenPagina": pagina, "origenFila": None, "existenciaProveedor": int(existencia), "ambiguo": False})
    return registros

def es_codigo_aquila(linea: str) -> bool:
    return bool(re.fullmatch(r"[A-Z0-9][A-Z0-9./() *-]{2,}", linea) and any(c.isdigit() for c in linea) and "$" not in linea and "%" not in linea and len(linea) < 45)

def extraer_aquila(ruta: Path) -> list[dict[str, Any]]:
    lector = PdfReader(str(ruta)); registros = []
    for pagina, hoja in enumerate(lector.pages, 1):
        lineas = [x.strip() for x in (hoja.extract_text() or "").splitlines() if x.strip()]
        for indice, codigo in enumerate(lineas):
            if not es_codigo_aquila(codigo): continue
            anteriores = lineas[max(0, indice - 24):indice]
            precios = [dinero(x) for x in anteriores if re.fullmatch(r"\$[\d,]+(?:\.\d{1,2})?", x)]
            precios = [x for x in precios if x is not None][-6:]
            if not precios: continue
            candidatos = [x for x in anteriores if not x.startswith("$") and not re.fullmatch(r"\d+\s*%", x) and x not in ("Colores:", "DESDE, POR NIVEL:") and not es_codigo_aquila(x)]
            nombre = candidatos[-1] if candidatos else codigo
            escalas = [{"nivel": nivel, "descuentoPorcentaje": descuento, "costoEfectivo": costo} for (nivel, descuento), costo in zip(NIVELES_AQUILA[-len(precios):], precios)]
            registros.append({"codigoOriginal": codigo, "codigoBarras": None, "nombre": nombre, "descripcion": "", "categoria": "", "marca": "AQUILA", "compatibilidades": [], "variantes": [], "precioBase": precios[0], "escalas": escalas, "imagenReferencia": None, "origenPagina": pagina, "origenFila": None, "ambiguo": ambiguo(codigo) or len(precios) != 6 or nombre == codigo})
    return registros

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("proveedor", choices=("REMO", "CEDIS", "AQUILA")); parser.add_argument("archivo", type=Path); parser.add_argument("salida", type=Path)
    args = parser.parse_args(); extractores = {"REMO": extraer_remo, "CEDIS": extraer_cedis, "AQUILA": extraer_aquila}
    registros = extractores[args.proveedor](args.archivo)
    claves: set[str] = set(); duplicados = 0
    for registro in registros:
        clave = registro["codigoOriginal"].upper()
        if clave in claves: duplicados += 1
        claves.add(clave)
    documento = {"proveedor": args.proveedor, "archivo": args.archivo.name, "sha256": sha256(args.archivo), "resumen": {"encontrados": len(registros), "ambiguos": sum(bool(x["ambiguo"]) for x in registros), "duplicados": duplicados, "sinImagen": sum(not x["imagenReferencia"] for x in registros)}, "registros": registros}
    args.salida.write_text(json.dumps(documento, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(documento["resumen"], ensure_ascii=False))

if __name__ == "__main__": main()
