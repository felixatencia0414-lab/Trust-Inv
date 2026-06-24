from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.database import get_session
from app.models import (
    ConteoZonaDetalle,
    InventarioValorizado,
    Producto,
    TomaInventarioMadre,
    ZonaInventario,
)

router = APIRouter(prefix="/api", tags=["movimientos"])


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
            detail={
                "error": "Estado de toma madre inválido",
                "estado_actual": madre.estado,
                "permitidos": estados_permitidos,
            },
        )


def _validar_estado_zona(zona: ZonaInventario, estados_permitidos: List[str]) -> None:
    if zona.estado not in estados_permitidos:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "Estado de zona inválido",
                "estado_actual": zona.estado,
                "permitidos": estados_permitidos,
            },
        )


class EstadoToma(str, Enum):
    CREADA = "CREADA"
    ABIERTA = "ABIERTA"
    CERRADA = "CERRADA"


class EstadoZona(str, Enum):
    CREADA = "CREADA"
    ABIERTA = "ABIERTA"
    CERRADA = "CERRADA"


@router.post("/tomas", status_code=201)
def crear_toma(session: Session = Depends(get_session)) -> dict:
    madre = TomaInventarioMadre(
        estado=EstadoToma.CREADA.value,
        fecha_creacion=datetime.utcnow(),
    )
    session.add(madre)
    session.commit()
    session.refresh(madre)
    return {"status": "ok", "id_madre": madre.id, "estado": madre.estado}


@router.post("/tomas/{id_madre}/zonas", status_code=201)
def crear_zona(
    id_madre: int,
    payload: dict,
    session: Session = Depends(get_session),
) -> dict:
    madre = _require_madre(session, id_madre)
    _validar_estado_madre(madre, [EstadoToma.CREADA.value, EstadoToma.ABIERTA.value])

    nombre_zona = (payload.get("nombre_zona") or "").strip()
    if not nombre_zona:
        raise HTTPException(status_code=400, detail="nombre_zona es requerido")

    zona = ZonaInventario(
        id_toma_madre=id_madre,
        nombre_zona=nombre_zona,
        estado=EstadoZona.CREADA.value,
    )
    session.add(zona)
    session.commit()
    session.refresh(zona)
    return {"status": "ok", "id_zona": zona.id, "estado": zona.estado}


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
        return {
            "status": "ok",
            "id_detalle": detalle.id,
            "cantidad_fisica_contada": detalle.cantidad_fisica_contada,
        }

    detalle = ConteoZonaDetalle(
        id_zona=zona.id,
        id_producto=producto.id,
        cantidad_fisica_contada=cantidad_add,
    )
    session.add(detalle)
    session.commit()
    session.refresh(detalle)
    return {
        "status": "ok",
        "id_detalle": detalle.id,
        "cantidad_fisica_contada": detalle.cantidad_fisica_contada,
    }


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

    return {
        "status": "ok",
        "id_zona": zona.id,
        "nombre_zona": zona.nombre_zona,
        "items": items,
    }


# Compatibilidad con flujo UI (abrir/cerrar madre y zona)
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

