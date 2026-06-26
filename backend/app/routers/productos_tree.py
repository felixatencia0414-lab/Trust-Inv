from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from app.database import get_session
from app.models import Categoria, InventarioValorizado, Producto, SubCategoria

router = APIRouter(prefix="/api", tags=["productos"])


@router.get("/productos/tree")
def productos_tree(session: Session = Depends(get_session)) -> dict:
    """Devuelve categorías -> subcategorías -> productos (anidado) con costos e inventario real.

    Reglas:
    - Devuelve SIEMPRE categorías, incluso si no tienen subcategorías.
    - Devuelve SIEMPRE subcategorías, incluso si no tienen productos.
    """



    # Paso 1) Categorías
    categorias = session.exec(select(Categoria).order_by(Categoria.nombre)).all()

    data: list[dict] = []

    # Paso 2) Subcategorías por categoría (SIEMPRE, aunque no tengan productos)
    for categoria in categorias:
        subcategorias = session.exec(
            select(SubCategoria)
            .where(SubCategoria.categoria_id == categoria.id)
            .order_by(SubCategoria.nombre)
        ).all()

        node_categoria = {
            "id_categoria": int(categoria.id),
            "nombre": categoria.nombre,
            "subcategorias": [],
        }

        # Paso 3) Productos por subcategoría (SIEMPRE, aunque no tengan productos)
        for sub in subcategorias:
            productos = session.exec(
                select(Producto)
                .where(Producto.subcategoria_id == sub.id)
                .order_by(Producto.nombre)
            ).all()

            node_sub = {
                "id_subcategoria": int(sub.id),
                "nombre": sub.nombre,
                "productos": [],
            }

            # Paso 4) Inventario por producto
            for prod in productos:
                inv = session.exec(
                    select(InventarioValorizado).where(
                        InventarioValorizado.id_producto == prod.id
                    )
                ).first()

                costo_unitario = float(inv.costo_unitario) if inv and inv.costo_unitario is not None else 0.0
                stock_teorico = int(inv.cantidad_sistema) if inv and inv.cantidad_sistema is not None else 0

                node_sub["productos"].append(
                    {
                        "id_producto": int(prod.id),
                        "codigo_barras": prod.codigo_barras,
                        "referencia": prod.referencia,
                        "nombre": prod.nombre,
                        "costo_unitario": costo_unitario,
                        "stock_teorico": stock_teorico,
                        "valor_diferencia": 0,
                        "diferencia_cantidad": 0,
                        "valor_diferencia_simple": 0,
                        "valor_diferencia_total": 0,
                    }
                )

            # IMPORTANTE: siempre agregar node_sub, aunque productos sea []
            node_categoria["subcategorias"].append(node_sub)

        data.append(node_categoria)

    return {"status": "ok", "data": data}


