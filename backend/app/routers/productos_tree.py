from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from app.database import get_session
from app.models import Categoria, Producto, SubCategoria
from sqlmodel import text  # <-- Asegúrate de importar 'text' arriba en tu archivo


router = APIRouter(prefix="/api", tags=["productos"])



@router.get("/productos/tree")
def productos_tree(session: Session = Depends(get_session)) -> dict:
    """Devuelve categorías -> subcategorías -> productos (anidado) con costos e inventario real."""

    # Consulta unificada en SQL crudo usando text() para integrar el LEFT JOIN dinámico
    query = text("""
        SELECT 
            c.id AS cat_id,
            c.nombre AS cat_nombre,
            s.id AS sub_id,
            s.nombre AS sub_nombre,
            p.id AS prod_id,
            p.codigo_barras AS codigo_barras,
            p.referencia AS referencia,
            p.nombre AS prod_nombre,
            COALESCE(iv.costo_unitario, 0) AS costo_unitario,
            COALESCE(iv.cantidad_sistema, 0) AS stock_teorico 
        FROM producto p
        LEFT JOIN subcategoria s ON p.subcategoria_id = s.id
        LEFT JOIN categoria c ON s.categoria_id = c.id
        LEFT JOIN (
            SELECT DISTINCT ON (id_producto) id_producto, costo_unitario, cantidad_sistema
            FROM inventariovalorizado
            ORDER BY id_producto, fecha_carga DESC
        ) iv ON p.id = iv.id_producto
        ORDER BY c.nombre, s.nombre, p.nombre;
    """)

    rows = session.exec(query).all()

    tree_by_cat: dict[int, dict] = {}
    tree_by_sub: dict[tuple[int, int], dict] = {}

    for r in rows:
        # Validamos que el producto pertenezca a una categoría y subcategoría antes de agrupar
        if r.cat_id is None or r.sub_id is None:
            continue
            
        cat_id = int(r.cat_id)
        sub_id = int(r.sub_id)
        key_sub = (cat_id, sub_id)

        if cat_id not in tree_by_cat:
            tree_by_cat[cat_id] = {
                "nombre": r.cat_nombre,
                "subcategorias": [],
            }

        if key_sub not in tree_by_sub:
            node_sub = {
                "nombre": r.sub_nombre,
                "productos": [],
            }
            tree_by_cat[cat_id]["subcategorias"].append(node_sub)
            tree_by_sub[key_sub] = node_sub

        tree_by_sub[key_sub]["productos"].append(
            {
                "id_producto": int(r.prod_id),
                "codigo_barras": r.codigo_barras,
                "referencia": r.referencia,
                "nombre": r.prod_nombre,
                # MAPEAMOS LOS VALORES REALES DE LA BASE DE DATOS AQUÍ:
                "costo_unitario": float(r.costo_unitario),
                "stock_teorico": int(r.stock_teorico),
                # campos opcionales para auditoría/TreeView:
                "valor_diferencia": 0,
                "diferencia_cantidad": 0,
                "valor_diferencia_simple": 0,
                "valor_diferencia_total": 0,
            }
        )

    data = [tree_by_cat[k] for k in sorted(tree_by_cat.keys())]
    return {"status": "ok", "data": data}