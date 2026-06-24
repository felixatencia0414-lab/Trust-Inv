from __future__ import annotations

from collections import defaultdict
from typing import Dict, List

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.database import get_session
from app.models import (
    Categoria,
    ConteoZonaDetalle,
    InventarioValorizado,
    Producto,
    SubCategoria,
    TomaInventarioMadre,
    ZonaInventario,
)
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/api", tags=["auditoria"])

# 1. Esquema para recibir la petición del frontend (aunque el modelo no guarde nombre, evita errores si el JSON lo envía)
class TomaCreate(BaseModel):
    nombre: Optional[str] = None


# 2. Endpoint POST para registrar la Toma Madre
@router.post("/tomas")
def crear_toma_madre(payload: TomaCreate, session: Session = Depends(get_session)) -> dict:
    """Crea una nueva Toma Madre utilizando el modelo físico sin columna de nombre."""
    try:
        # Instanciamos usando únicamente las columnas reales de tu SQLModel
        nueva_toma = TomaInventarioMadre(
            estado="CREADA"  # Mantiene consistencia con tus filtros de auditoría
            # fecha_creacion se genera automáticamente con datetime.utcnow gracias al default_factory
        )
        
        session.add(nueva_toma)
        session.commit()
        session.refresh(nueva_toma)
        
        # Le respondemos al frontend mapeando el ID como 'id_madre' para que React no se rompa
        return {
            "status": "ok",
            "id_madre": nueva_toma.id,
            "nombre": payload.nombre or f"Toma #{nueva_toma.id}", # Frontend visual
            "estado": nueva_toma.estado
        }
        
    except Exception as e:
        session.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Error al inicializar la toma madre en la base de datos: {str(e)}"
        )




def _require_madre(session: Session, id_madre: int) -> TomaInventarioMadre:
    madre = session.exec(select(TomaInventarioMadre).where(TomaInventarioMadre.id == id_madre)).first()
    if not madre:
        raise HTTPException(status_code=404, detail=f"Toma madre {id_madre} no encontrada")
    return madre


@router.get("/tomas/{id_madre}/zonas-monitoreo")
def zonas_monitoreo(id_madre: int, session: Session = Depends(get_session)) -> dict:
    """Devuelve {id_zona, nombre_zona, estado} para tarjetas de auditoría."""
    madre = _require_madre(session, id_madre)

    zonas = session.exec(
        select(ZonaInventario).where(ZonaInventario.id_toma_madre == madre.id)
    ).all()

    items = [
        {
            "id_zona": z.id,
            "nombre_zona": z.nombre_zona,
            "estado": z.estado,
        }
        for z in zonas
    ]

    return {"status": "ok", "zonas": items}


@router.post("/tomas/{id_madre}/consolidar")
def consolidar(id_madre: int, session: Session = Depends(get_session)) -> dict:
    """Cierra toma y zonas y ejecuta cruce masivo (placeholder hasta alinear lógica real de valuación).

    Nota: el sistema de cruce masivo probablemente exista en otra parte del backend.
    Aquí dejamos el endpoint operativo y consistente con el flujo.
    """
    madre = _require_madre(session, id_madre)

    # Cambiar estado de la toma y zonas
    madre.estado = "CERRADA"
    session.add(madre)

    zonas = session.exec(
        select(ZonaInventario).where(ZonaInventario.id_toma_madre == madre.id)
    ).all()
    for z in zonas:
        z.estado = "CERRADA"
        session.add(z)

    session.commit()

    # El cruce masivo se implementa en el reporte-arbol usando conteos vs inventario valorizado.
    # Para mantener la operación sin duplicar lógica, retornamos éxito.
    return {"status": "success", "message": "Toma consolidada y cerrada correctamente"}


@router.get("/tomas/{id_madre}/reporte-arbol")
def reporte_arbol(id_madre: int, session: Session = Depends(get_session)) -> dict:

    """Reporte jerárquico (Categoría -> Subcategoría -> Producto)

    Calcula:
    - Sistema: InventarioValorizado.cantidad_sistema
    - Conteo: sum(ConteoZonaDetalle.cantidad_fisica_contada) para todas las zonas de la toma
    - Diferencia (cantidad): conteo_total - cantidad_sistema
    - Valor diferencia: diferencia * costo_unitario

    Devuelve formato anidado apto para el TreeView.
    """

    madre = _require_madre(session, id_madre)

    zonas = session.exec(
        select(ZonaInventario).where(ZonaInventario.id_toma_madre == madre.id)
    ).all()
    if not zonas:
        raise HTTPException(status_code=400, detail="La toma no tiene zonas asociadas")

    zona_ids = [z.id for z in zonas]

    conteos = session.exec(
        select(ConteoZonaDetalle).where(ConteoZonaDetalle.id_zona.in_(zona_ids))
    ).all()

    conteo_por_producto: Dict[int, int] = defaultdict(int)
    for d in conteos:
        conteo_por_producto[int(d.id_producto)] += int(d.cantidad_fisica_contada)

    # Tomamos inventario valorizado para los productos contados (o para todos si prefieres)
    productos_ids = list(conteo_por_producto.keys())
    if not productos_ids:
        # árbol vacío pero consistente
        return {"status": "ok", "data": []}

    invs = session.exec(
        select(InventarioValorizado).where(InventarioValorizado.id_producto.in_(productos_ids))
    ).all()
    inv_by_prod = {int(inv.id_producto): inv for inv in invs}

    # Consultar jerarquía desde Producto -> SubCategoria -> Categoria
    productos = session.exec(select(Producto).where(Producto.id.in_(productos_ids))).all()

    cat_children: Dict[int, dict] = {}

    for p in productos:
        # conteo (mock real)
        cantidad_contada = int(conteo_por_producto.get(int(p.id), 0))

        inv = inv_by_prod.get(int(p.id))
        if not inv:
            # Strict: solo productos con inventario
            continue

        cantidad_sistema = int(inv.cantidad_sistema)
        diferencia = cantidad_contada - cantidad_sistema
        valor_dif = float(diferencia) * float(inv.costo_unitario)

        sub = p.subcategoria
        if not sub:
            # fallback: query
            sub = session.exec(select(SubCategoria).where(SubCategoria.id == p.id_subcategoria)).first()

        cat = sub.categoria if sub and sub.categoria else None
        if not cat and sub:
            cat = session.exec(select(Categoria).where(Categoria.id == sub.id_categoria)).first()

        if not cat or not sub:
            continue

        cat_id = int(cat.id)
        sub_id = int(sub.id)

        if cat_id not in cat_children:
            cat_children[cat_id] = {"nombre": cat.nombre, "subcategorias": [], "_sub_map": {}}

        sub_map = cat_children[cat_id]["_sub_map"]
        if sub_id not in sub_map:
            node_sub = {"nombre": sub.nombre, "productos": []}
            cat_children[cat_id]["subcategorias"].append(node_sub)
            sub_map[sub_id] = node_sub

        prod_node = {
            "id_producto": p.id,
            "codigo_barras": p.codigo_barras,
            "referencia": p.referencia,
            "nombre": p.nombre,
            "costo_unitario": inv.costo_unitario,
            "stock_teorico": inv.cantidad_sistema,
            # TreeView / auditoría
            "diferencia_cantidad": diferencia,
            "valor_diferencia": valor_dif,
            "valor_diferencia_simple": valor_dif,
            "valor_diferencia_total": valor_dif,
        }
        sub_map[sub_id]["productos"].append(prod_node)

    # Orden estable
    data = []
    for cat_id, node in cat_children.items():
        node["subcategorias"] = sorted(
            node["subcategorias"], key=lambda x: x["nombre"]
        )
        for sub_node in node["subcategorias"]:
            sub_node["productos"] = sorted(sub_node["productos"], key=lambda x: x["nombre"])
        data.append({"nombre": node["nombre"], "subcategorias": node["subcategorias"]})

    data = sorted(data, key=lambda x: x["nombre"])

    return {"status": "ok", "data": data}

