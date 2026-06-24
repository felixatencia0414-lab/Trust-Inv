from __future__ import annotations

import io
from datetime import datetime
from enum import Enum
from typing import Dict, List, Optional

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlmodel import Session, select

from app.database import get_session
from app.models import (
    ConteoZonaDetalle,
    InventarioValorizado,
    Producto,
    TomaInventarioMadre,
    ZonaInventario,
)

router = APIRouter(prefix="/api", tags=["inventarios"])


# -----------------
# Utilidades
# -----------------

def _require_madre(session: Session, id_madre: int) -> TomaInventarioMadre:
    madre = session.exec(select(TomaInventarioMadre).where(TomaInventarioMadre.id == id_madre)).first()
    if not madre:
        raise HTTPException(status_code=404, detail=f"Toma madre {id_madre} no encontrada")
    return madre


def _require_zona(session: Session, id_zona: int, id_madre: Optional[int] = None) -> ZonaInventario:
    stmt = select(ZonaInventario).where(ZonaInventario.id == id_zona)
    if id_madre is not None:
        stmt = stmt.where(ZonaInventario.id_toma_madre == id_madre)

    zona = session.exec(stmt).first()
    if not zona:
        raise HTTPException(status_code=404, detail=f"Zona {id_zona} no encontrada")
    return zona


def _validar_estado_madre(madre: TomaInventarioMadre, estados_permitidos: List[str]) -> None:
    if madre.estado not in estados_permitidos:
        raise HTTPException(
            status_code=400,
            detail={"error": "Estado de toma madre inválido", "estado_actual": madre.estado, "permitidos": estados_permitidos},
        )


def _validar_estado_zona(zona: ZonaInventario, estados_permitidos: List[str]) -> None:
    if zona.estado not in estados_permitidos:
        raise HTTPException(
            status_code=400,
            detail={"error": "Estado de zona inválido", "estado_actual": zona.estado, "permitidos": estados_permitidos},
        )


# -----------------
# Endpoints estado
# -----------------


class EstadoToma(str, Enum):
    CREADA = "CREADA"
    ABIERTA = "ABIERTA"
    CERRADA = "CERRADA"


class EstadoZona(str, Enum):
    CREADA = "CREADA"
    ABIERTA = "ABIERTA"
    CERRADA = "CERRADA"


@router.post("/api/tomas") # o como lo tengas mapeado en Swagger
def crear_toma(session: Session = Depends(get_session)):
    try:
        # Reemplaza con los campos obligatorios reales de tu modelo
        nueva_toma = TomaInventarioMadre(estado="ABIERTA") 
        session.add(nueva_toma)
        session.commit()
        session.refresh(nueva_toma)
        
        print(f"🚀 ¡DB EXITO! Toma creada físicamente con ID: {nueva_toma.id_madre}")
        return nueva_toma
    except Exception as e:
        print(f"❌ ERROR AL CREAR TOMA: {e}")
        session.rollback()
        return {"error": str(e)}

@router.get("/api/tomas")
def listar_tomas(session: Session = Depends(get_session)):
    try:
        from sqlmodel import select
        
        # 💡 CAMBIO CLAVE: Ordenamos por .id si .id_madre no existe en el modelo de Python
        statement = select(TomaInventarioMadre).order_by(TomaInventarioMadre.id.desc())
        resultados = session.exec(statement).all()
        
        print(f"🔍 ¡DB CONSULTA! Cantidad de registros leídos en memoria: {len(resultados)}")
        return resultados
    except Exception as e:
        print(f"❌ ERROR AL LISTAR TOMAS SEGUNDO INTENTO: {e}")
        # Si vuelve a fallar por 'id', intentemos traerlas sin ordenar para que no se rompa:
        try:
            return session.exec(select(TomaInventarioMadre)).all()
        except Exception as e2:
            print(f"❌ ERROR DE PLAN B: {e2}")
            return []

# 🚨 Asegúrate de agregar el prefijo duplicado /api/api para que coincida con el frontend
# 💡 DEJA SOLO UN "/api" AQUÍ. Al combinarse con el prefijo global del main, creará "/api/api/tomas/..."
@router.get("/api/tomas/{id_toma}/zonas")
def listar_zonas_por_toma(id_toma: int, session: Session = Depends(get_session)):
    try:
        from sqlmodel import select
        
        statement = select(ZonaInventario).where(ZonaInventario.id_toma_madre == id_toma)
        resultados = session.exec(statement).all()
        
        print(f"📡 [DB EXITOSA] Se encontraron {len(resultados)} zonas para la toma madre #{id_toma}")
        return resultados
    except Exception as e:
        print(f"❌ Error en el backend al listar zonas: {e}")
        return []
    
    
@router.post("/tomas/{id_madre}/abrir")
def abrir_madre(id_madre: int, session: Session = Depends(get_session)) -> dict:
    madre = _require_madre(session, id_madre)
    _validar_estado_madre(madre, [EstadoToma.CREADA.value])
    madre.estado = EstadoToma.ABIERTA.value
    session.add(madre)
    session.commit()
    return {"status": "ok", "id_madre": madre.id, "estado": madre.estado}


@router.post("/tomas/{id_madre}/cerrar")
def cerrar_madre(id_madre: int, session: Session = Depends(get_session)) -> dict:
    madre = _require_madre(session, id_madre)
    _validar_estado_madre(madre, [EstadoToma.ABIERTA.value, EstadoToma.CREADA.value])
    madre.estado = EstadoToma.CERRADA.value
    session.add(madre)
    session.commit()
    return {"status": "ok", "id_madre": madre.id, "estado": madre.estado}


@router.post("/tomas/{id_madre}/zonas", status_code=status.HTTP_201_CREATED)
def crear_zona(
    id_madre: int,
    payload: dict,
    session: Session = Depends(get_session),
) -> dict:
    # payload esperado: {"nombre_zona": "Pasillo 1"}
    madre = _require_madre(session, id_madre)
    _validar_estado_madre(madre, [EstadoToma.CREADA.value, EstadoToma.ABIERTA.value])

    nombre_zona = (payload.get("nombre_zona") or "").strip()
    if not nombre_zona:
        raise HTTPException(status_code=400, detail="nombre_zona es requerido")

    zona = ZonaInventario(id_toma_madre=id_madre, nombre_zona=nombre_zona, estado=EstadoZona.CREADA.value)
    session.add(zona)
    session.commit()
    session.refresh(zona)
    return {"status": "ok", "id_zona": zona.id, "estado": zona.estado}


@router.post("/zonas/{id_zona}/abrir")
def abrir_zona(id_zona: int, session: Session = Depends(get_session)) -> dict:
    zona = _require_zona(session, id_zona)
    _validar_estado_zona(zona, [EstadoZona.CREADA.value])
    zona.estado = EstadoZona.ABIERTA.value
    session.add(zona)
    session.commit()
    return {"status": "ok", "id_zona": zona.id, "estado": zona.estado}


@router.post("/zonas/{id_zona}/cerrar")
def cerrar_zona(id_zona: int, session: Session = Depends(get_session)) -> dict:
    zona = _require_zona(session, id_zona)
    _validar_estado_zona(zona, [EstadoZona.CREADA.value, EstadoZona.ABIERTA.value])
    zona.estado = EstadoZona.CERRADA.value
    session.add(zona)
    session.commit()
    return {"status": "ok", "id_zona": zona.id, "estado": zona.estado}


# -----------------
# Conteo Zona
# -----------------


@router.post("/zonas/{id_zona}/conteos")
def agregar_conteo(
    id_zona: int,
    payload: dict,
    session: Session = Depends(get_session),
) -> dict:
    # payload: {"codigo_barras": "string", "cantidad_fisica_contada": int}
    zona = _require_zona(session, id_zona)
    _validar_estado_zona(zona, [EstadoZona.ABIERTA.value])

    codigo_barras = (payload.get("codigo_barras") or "").strip()
    if not codigo_barras:
        raise HTTPException(status_code=400, detail="codigo_barras es requerido")

    if "cantidad_fisica_contada" not in payload:
        raise HTTPException(status_code=400, detail="cantidad_fisica_contada es requerido")

    try:
        cantidad_add = int(payload["cantidad_fisica_contada"])
    except Exception:
        raise HTTPException(status_code=400, detail="cantidad_fisica_contada debe ser int")

    producto = session.exec(select(Producto).where(Producto.codigo_barras == codigo_barras)).first()
    if not producto:
        raise HTTPException(status_code=400, detail=f"codigo_barras no existe en maestro: {codigo_barras}")

    # Buscar si ya existe conteo en esa zona
    detalle = session.exec(
        select(ConteoZonaDetalle)
        .where(ConteoZonaDetalle.id_zona == zona.id)
        .where(ConteoZonaDetalle.id_producto == producto.id)
    ).first()

    if detalle:
        detalle.cantidad_fisica_contada += cantidad_add
        session.add(detalle)
        session.commit()
        session.refresh(detalle)
        return {"status": "ok", "id_detalle": detalle.id, "cantidad_fisica_contada": detalle.cantidad_fisica_contada}

    detalle = ConteoZonaDetalle(id_zona=zona.id, id_producto=producto.id, cantidad_fisica_contada=cantidad_add)
    session.add(detalle)
    session.commit()
    session.refresh(detalle)
    return {"status": "ok", "id_detalle": detalle.id, "cantidad_fisica_contada": detalle.cantidad_fisica_contada}


@router.get("/zonas/{id_zona}/conteos")
def listar_conteos_zona(id_zona: int, session: Session = Depends(get_session)) -> dict:
    zona = _require_zona(session, id_zona)

    detalles = session.exec(
        select(ConteoZonaDetalle, Producto)
        .where(ConteoZonaDetalle.id_zona == zona.id)
        .where(ConteoZonaDetalle.id_producto == Producto.id)
    ).all()

    items = []
    for detalle, producto in detalles:
        items.append(
            {
                "id_producto": producto.id,
                "codigo_barras": producto.codigo_barras,
                "referencia": producto.referencia,
                "nombre": producto.nombre,
                "cantidad_fisica_contada": detalle.cantidad_fisica_contada,
            }
        )

    return {"status": "ok", "id_zona": zona.id, "nombre_zona": zona.nombre_zona, "items": items}


# -----------------
# Consolidación + Export
# -----------------


@router.post("/tomas/{id_madre}/consolidar")
def consolidar(id_madre: int, session: Session = Depends(get_session)) -> dict:
    madre = _require_madre(session, id_madre)
    _validar_estado_madre(madre, [EstadoToma.CREADA.value, EstadoToma.ABIERTA.value])

    zonas = session.exec(
        select(ZonaInventario).where(ZonaInventario.id_toma_madre == madre.id)
    ).all()

    if not zonas:
        raise HTTPException(status_code=400, detail="La toma no tiene zonas asociadas")

    abiertas = [z for z in zonas if z.estado != EstadoZona.CERRADA.value]
    if abiertas:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "No se puede consolidar: todas las zonas deben estar CERRADAS",
                "zonas_no_cerradas": [{"id_zona": z.id, "estado": z.estado, "nombre_zona": z.nombre_zona} for z in abiertas],
            },
        )

    # Sumar conteos por producto en TODAS las zonas
    detalles = session.exec(
        select(ConteoZonaDetalle).where(ConteoZonaDetalle.id_zona.in_([z.id for z in zonas]))
    ).all()

    acumulados: Dict[int, int] = {}
    for d in detalles:
        acumulados[d.id_producto] = acumulados.get(d.id_producto, 0) + int(d.cantidad_fisica_contada)

    # Exportar / calcular diferencias contra InventarioValorizado.cantidad_sistema
    # Nota: si no hay inventario valorizado para un producto, lo ignoramos o puedes decidir error.
    resultados = []
    for id_producto, cantidad_contada_total in acumulados.items():
        inv = session.exec(select(InventarioValorizado).where(InventarioValorizado.id_producto == id_producto)).first()
        if not inv:
            # Producto contado pero no existe en inventario valorizado => error estricto
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "Producto contado no existe en InventarioValorizado",
                    "id_producto": id_producto,
                    "codigo_barras": inv.producto.codigo_barras if inv and inv.producto else None,
                },
            )

        diff = int(cantidad_contada_total) - int(inv.cantidad_sistema)
        resultados.append((id_producto, cantidad_contada_total, inv.cantidad_sistema, diff, inv.costo_unitario))

    madre.estado = EstadoToma.CERRADA.value
    session.add(madre)
    session.commit()

    return {
        "status": "ok",
        "id_madre": madre.id,
        "zonas": len(zonas),
        "productos_conteados": len(acumulados),
        "resultados": [
            {
                "id_producto": r[0],
                "cantidad_contada_total": r[1],
                "cantidad_sistema": r[2],
                "diferencia": r[3],
                "costo_unitario": r[4],
            }
            for r in resultados
        ],
    }


@router.get("/tomas/{id_madre}/exportar")
def exportar(id_madre: int, session: Session = Depends(get_session)):
    madre = _require_madre(session, id_madre)

    zonas = session.exec(
        select(ZonaInventario).where(ZonaInventario.id_toma_madre == madre.id)
    ).all()

    if not zonas:
        raise HTTPException(status_code=400, detail="La toma no tiene zonas asociadas")

    # Sumar conteos por producto
    detalles = session.exec(
        select(ConteoZonaDetalle)
        .where(ConteoZonaDetalle.id_zona.in_([z.id for z in zonas]))
    ).all()

    acumulados: Dict[int, int] = {}
    for d in detalles:
        acumulados[d.id_producto] = acumulados.get(d.id_producto, 0) + int(d.cantidad_fisica_contada)

    # Cargar inventario valorizado y armar tabla
    rows = []
    invs = session.exec(
        select(InventarioValorizado).where(InventarioValorizado.id_producto.in_(list(acumulados.keys())))
    ).all()

    inv_by_id = {inv.id_producto: inv for inv in invs}

    for id_producto, cantidad_contada_total in acumulados.items():
        inv = inv_by_id.get(id_producto)
        if not inv:
            # Si hay conteos pero no existe inventario valorizado
            raise HTTPException(
                status_code=400,
                detail={"error": "InventarioValorizado no encontrado para producto", "id_producto": id_producto},
            )

        diff = int(cantidad_contada_total) - int(inv.cantidad_sistema)
        valor_diferencia = float(diff) * float(inv.costo_unitario)

        rows.append(
            {
                "Código de Barras": inv.producto.codigo_barras if inv.producto else "",
                "Referencia": inv.producto.referencia if inv.producto else "",
                "Nombre": inv.producto.nombre if inv.producto else "",
                "Cantidad Sistema": inv.cantidad_sistema,
                "Cantidad Contada Total": cantidad_contada_total,
                "Diferencia": diff,
                "Costo Unitario": inv.costo_unitario,
                "Valor Diferencia": valor_diferencia,
            }
        )

    df = pd.DataFrame(rows)

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Consolidado")

    output.seek(0)

    from fastapi.responses import StreamingResponse

    filename = f"toma_{madre.id}_consolidado.xlsx"
    headers = {"Content-Disposition": f"attachment; filename={filename}"}
    return StreamingResponse(output, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers=headers)

