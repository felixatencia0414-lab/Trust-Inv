from datetime import datetime
from typing import List, Optional

from sqlmodel import Field, Relationship, SQLModel

# Nota: Se eliminó 'from __future__ import annotations' para evitar el conflicto con el ORM


class Categoria(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    nombre: str = Field(index=True, nullable=False, max_length=200)

    # 1 -> N - Usamos List sin comillas internas para que el ORM lo lea directo
    subcategorias: List["SubCategoria"] = Relationship(back_populates="categoria")


class SubCategoria(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    nombre: str = Field(index=True, nullable=False, max_length=200)

    categoria_id: int = Field(foreign_key="categoria.id", nullable=False)

    categoria: "Categoria" = Relationship(back_populates="subcategorias")
    productos: List["Producto"] = Relationship(back_populates="subcategoria")


class Producto(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)

    codigo_barras: str = Field(
        nullable=False,
        index=True,
        max_length=100,
    )
    referencia: Optional[str] = Field(default=None, max_length=200)
    nombre: str = Field(nullable=False, max_length=250)

    subcategoria_id: int = Field(foreign_key="subcategoria.id", nullable=False)
    subcategoria: "SubCategoria" = Relationship(back_populates="productos")

    inventarios: List["InventarioValorizado"] = Relationship(back_populates="producto")


class InventarioValorizado(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)

    id_producto: int = Field(foreign_key="producto.id", nullable=False, index=True)
    producto: "Producto" = Relationship(back_populates="inventarios")

    costo_unitario: float = Field(nullable=False)
    cantidad_sistema: int = Field(nullable=False)
    costo_total_sistema: float = Field(nullable=False)

    fecha_carga: datetime = Field(default_factory=datetime.utcnow, nullable=False)

    def calcular_costo_total(self) -> None:
        self.costo_total_sistema = float(self.cantidad_sistema) * float(self.costo_unitario)


class TomaInventarioMadre(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    nombre: str = Field(nullable=False, max_length=255)  # <-- TIENES QUE AGREGAR ESTA
    fecha_creacion: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    estado: str = Field(nullable=False, index=True, max_length=20)


class ZonaInventario(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    id_toma_madre: int = Field(
        foreign_key="tomainventariomadre.id",
        nullable=False,
        index=True,
    )
    nombre_zona: str = Field(nullable=False, max_length=200)
    estado: str = Field(nullable=False, index=True, max_length=20)


class ConteoZonaDetalle(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    id_zona: int = Field(foreign_key="zonainventario.id", nullable=False, index=True)
    id_producto: int = Field(foreign_key="producto.id", nullable=False, index=True)

    cantidad_fisica_contada: int = Field(nullable=False)