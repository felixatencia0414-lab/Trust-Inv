from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.database import get_session
from app.models import Categoria, SubCategoria

router = APIRouter(prefix="/api", tags=["parametros"])


@router.post("/categorias", status_code=201)
def crear_categoria(payload: dict, session: Session = Depends(get_session)) -> dict:
    """Crea una categoría.

    payload esperado: {"nombre": "Lácteos"}
    """
    nombre = (payload.get("nombre") or "").strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="nombre es requerido")

    existente = session.exec(select(Categoria).where(Categoria.nombre == nombre)).first()
    if existente:
        return {"status": "ok", "id_categoria": existente.id, "nombre": existente.nombre}

    cat = Categoria(nombre=nombre)
    session.add(cat)
    session.commit()
    session.refresh(cat)
    return {"status": "ok", "id_categoria": cat.id, "nombre": cat.nombre}


@router.post("/subcategorias", status_code=201)
def crear_subcategoria(payload: dict, session: Session = Depends(get_session)) -> dict:
    """Crea una subcategoría.

    payload esperado: {"id_categoria": 1, "nombre": "Yogurt"}
    """
    id_categoria = payload.get("id_categoria")
    nombre = (payload.get("nombre") or "").strip()

    if not id_categoria:
        raise HTTPException(status_code=400, detail="id_categoria es requerido")
    if not nombre:
        raise HTTPException(status_code=400, detail="nombre es requerido")

    categoria = session.exec(select(Categoria).where(Categoria.id == int(id_categoria))).first()
    if not categoria:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")

    existente = session.exec(
        select(SubCategoria).where(
            SubCategoria.id_categoria == categoria.id,
            SubCategoria.nombre == nombre,
        )
    ).first()

    if existente:
        return {
            "status": "ok",
            "id_subcategoria": existente.id,
            "id_categoria": existente.id_categoria,
            "nombre": existente.nombre,
        }

    sub = SubCategoria(id_categoria=categoria.id, nombre=nombre)
    session.add(sub)
    session.commit()
    session.refresh(sub)

    return {
        "status": "ok",
        "id_subcategoria": sub.id,
        "id_categoria": sub.id_categoria,
        "nombre": sub.nombre,
    }

