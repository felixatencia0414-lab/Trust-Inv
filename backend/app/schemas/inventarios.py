from __future__ import annotations

from pydantic import BaseModel


class CrearZonaRequest(BaseModel):
    nombre_zona: str


class ConteoZonaRequest(BaseModel):
    codigo_barras: str
    cantidad_fisica_contada: int

