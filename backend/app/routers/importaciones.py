from __future__ import annotations

import io
from datetime import datetime
from typing import Optional

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlmodel import Session, select
from sqlmodel.sql.expression import Select

from app.database import get_session
from app.models import Categoria, InventarioValorizado, Producto, SubCategoria

router = APIRouter(prefix="/api", tags=["importaciones"])


def _normalizar_df(df: pd.DataFrame) -> pd.DataFrame:
    # Normaliza nombres de columnas: quita espacios raros y usa formato consistente.
    df = df.copy()
    df.columns = [str(c).strip() for c in df.columns]
    return df


def _limpiar_codigo_barras(val) -> str:
    """Evita que códigos numéricos se importen con .0 o formato científico"""
    if pd.isna(val):
        return ""
    txt = str(val).strip()
    if txt.endswith(".0"):
        txt = txt[:-2]
    return txt


@router.post("/importar-maestro")
def importar_maestro(
    archivo: UploadFile = File(...),
    session: Session = Depends(get_session),
):
    if not archivo.filename.lower().endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="El archivo debe ser .xlsx")

    raw = archivo.file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Archivo vacío")

    try:
        df = pd.read_excel(io.BytesIO(raw), engine="openpyxl")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"No se pudo leer Excel: {e}")

    df = _normalizar_df(df)

    columnas_requeridas = ["Categoria", "Subcategoria", "CodigoBarras", "Referencia", "Nombre"]
    missing = [c for c in columnas_requeridas if c not in df.columns]
    if missing:
        raise HTTPException(status_code=400, detail=f"Faltan columnas: {missing}")

    # Upsert simple por nombre/código
    categorias_cache: dict[str, Categoria] = {}
    subcategorias_cache: dict[tuple[int, str], SubCategoria] = {}
    productos_cache: dict[str, Producto] = {}

    for row in df.itertuples(index=False):
        categoria_nombre = str(getattr(row, "Categoria")).strip() if hasattr(row, "Categoria") else ""
        subcategoria_nombre = str(getattr(row, "Subcategoria")).strip() if hasattr(row, "Subcategoria") else ""
        
        # Limpieza robusta del código de barras para evitar flotantes (.0)
        codigo_barras = _limpiar_codigo_barras(getattr(row, "CodigoBarras")) if hasattr(row, "CodigoBarras") else ""
        
        referencia = getattr(row, "Referencia")
        nombre = str(getattr(row, "Nombre")).strip() if hasattr(row, "Nombre") else ""

        if not categoria_nombre or not subcategoria_nombre or not codigo_barras or not nombre:
            # Saltamos filas incompletas.
            continue

        # Categoria
        if categoria_nombre in categorias_cache:
            categoria = categorias_cache[categoria_nombre]
        else:
            stmt = select(Categoria).where(Categoria.nombre == categoria_nombre)
            categoria = session.exec(stmt).first()
            if not categoria:
                categoria = Categoria(nombre=categoria_nombre)
                session.add(categoria)
                session.commit()
                session.refresh(categoria)
            categorias_cache[categoria_nombre] = categoria

        # SubCategoria
        key_sc = (categoria.id, subcategoria_nombre)
        if key_sc in subcategorias_cache:
            subcategoria = subcategorias_cache[key_sc]
        else:
            stmt = select(SubCategoria).where(
                SubCategoria.categoria_id == categoria.id,
                SubCategoria.nombre == subcategoria_nombre,
            )
            subcategoria = session.exec(stmt).first()
            if not subcategoria:
                subcategoria = SubCategoria(
                    nombre=subcategoria_nombre,
                    categoria_id=categoria.id,
                )
                session.add(subcategoria)
                session.commit()
                session.refresh(subcategoria)
            subcategorias_cache[key_sc] = subcategoria

        # Producto por codigo_barras (único lógico)
        if codigo_barras in productos_cache:
            producto = productos_cache[codigo_barras]
        else:
            stmt = select(Producto).where(Producto.codigo_barras == codigo_barras)
            producto = session.exec(stmt).first()
            
            # Formatear la referencia de manera segura
            ref_str = None
            if not pd.isna(referencia):
                ref_str = str(referencia).strip()
                if ref_str.endswith(".0"):
                    ref_str = ref_str[:-2]

            if not producto:
                # 🛠️ CORRECCIÓN: Se cambió id_subcategoria por subcategoria_id
                producto = Producto(
                    codigo_barras=codigo_barras,
                    referencia=ref_str,
                    nombre=nombre,
                    subcategoria_id=subcategoria.id, 
                )
                session.add(producto)
                session.commit()
                session.refresh(producto)
            else:
                # Actualiza campos si cambió el maestro
                producto.referencia = ref_str
                producto.nombre = nombre
                # 🛠️ CORRECCIÓN: Se cambió id_subcategoria por subcategoria_id
                producto.subcategoria_id = subcategoria.id
                session.add(producto)
                session.commit()
                session.refresh(producto)

            productos_cache[codigo_barras] = producto

    return {"status": "ok"}


@router.post("/productos", status_code=201)
def crear_producto(
    payload: dict,
    session: Session = Depends(get_session),
):
    # Validaciones básicas (mínima intervención)
    codigo_barras = str(payload.get("codigo_barras") or "").strip()
    nombre = str(payload.get("nombre") or "").strip()
    referencia = payload.get("referencia")
    referencia = (str(referencia).strip() if referencia is not None else None)
    id_subcategoria = payload.get("id_subcategoria")
    if id_subcategoria is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="id_subcategoria es requerido")

    try:
        id_subcategoria = int(id_subcategoria)
    except Exception:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="id_subcategoria debe ser int")

    if not codigo_barras:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="codigo_barras es requerido")
    if not nombre:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="nombre es requerido")

    # Validar duplicado
    prod_exist = session.exec(select(Producto).where(Producto.codigo_barras == codigo_barras)).first()
    if prod_exist:
        from fastapi import HTTPException
        raise HTTPException(status_code=409, detail="Producto ya existe")

    # Obtener campos numéricos
    costo_unitario = payload.get("costo_unitario")
    stock_teorico = payload.get("stock_teorico")

    try:
        costo_unitario_f = float(costo_unitario)
    except Exception:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="costo_unitario debe ser numérico")

    try:
        stock_teorico_i = int(stock_teorico)
    except Exception:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="stock_teorico debe ser int")

    # Validar subcategoría
    sub = session.exec(select(SubCategoria).where(SubCategoria.id == id_subcategoria)).first()
    if not sub:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="id_subcategoria no existe")

    producto = Producto(
        codigo_barras=codigo_barras,
        nombre=nombre,
        referencia=referencia,
        subcategoria_id=id_subcategoria,
    )
    session.add(producto)
    session.commit()
    session.refresh(producto)

    inv = InventarioValorizado(
        id_producto=producto.id,
        costo_unitario=costo_unitario_f,
        cantidad_sistema=stock_teorico_i,
        costo_total_sistema=float(costo_unitario_f) * float(stock_teorico_i),
    )
    session.add(inv)
    session.commit()
    session.refresh(producto)

    return {"status": "ok", "id_producto": producto.id}


@router.post("/importar-inventario")
def importar_inventario(
    archivo: UploadFile = File(...),
    session: Session = Depends(get_session),
):
    if not archivo.filename.lower().endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="El archivo debe ser .xlsx")

    raw = archivo.file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Archivo vacío")

    try:
        df = pd.read_excel(io.BytesIO(raw), engine="openpyxl")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"No se pudo leer Excel: {e}")

    df = _normalizar_df(df)

    columnas_requeridas = ["CodigoBarras", "CostoUnitario", "CantidadSistema"]
    missing = [c for c in columnas_requeridas if c not in df.columns]
    if missing:
        raise HTTPException(status_code=400, detail=f"Faltan columnas: {missing}")

    inserted = 0
    updated = 0

    # 1. Limpieza estricta de códigos flotantes (.0) provenientes de Excel
    df["CodigoBarrasClean"] = df["CodigoBarras"].apply(_limpiar_codigo_barras)
    unique_codigos = df["CodigoBarrasClean"].unique().tolist()
    unique_codigos = [c for c in unique_codigos if c]

    # 2. Buscar solo los productos que ya existen en la base de datos
    productos = session.exec(select(Producto).where(Producto.codigo_barras.in_(unique_codigos))).all()
    productos_by_code = {p.codigo_barras: p for p in productos}

    for row in df.itertuples(index=False):
        # Usar la columna limpia
        codigo_barras = _limpiar_codigo_barras(getattr(row, "CodigoBarras"))
        if not codigo_barras:
            continue

        # Si el producto NO existe en el maestro, se ignora por completo (Garantiza integridad)
        producto = productos_by_code.get(codigo_barras)
        if not producto:
            continue

        costo_unitario = getattr(row, "CostoUnitario")
        cantidad_sistema = getattr(row, "CantidadSistema")

        if pd.isna(costo_unitario) or pd.isna(cantidad_sistema):
            continue

        costo_unitario_f = float(costo_unitario)
        cantidad_i = int(cantidad_sistema)
        costo_total = costo_unitario_f * float(cantidad_i)

        inv = session.exec(
            select(InventarioValorizado).where(InventarioValorizado.id_producto == producto.id)
        ).first()

        if inv:
            inv.costo_unitario = costo_unitario_f
            inv.cantidad_sistema = cantidad_i
            inv.costo_total_sistema = float(costo_total)
            inv.fecha_carga = datetime.utcnow()
            session.add(inv)
            updated += 1
        else:
            inv = InventarioValorizado(
                id_producto=producto.id,
                costo_unitario=costo_unitario_f,
                cantidad_sistema=cantidad_i,
                costo_total_sistema=float(costo_total),
                fecha_carga=datetime.utcnow(),
            )
            session.add(inv)
            inserted += 1

    session.commit() # Un único commit al final del lote para mayor velocidad
    return {"status": "ok", "inserted": inserted, "updated": updated}