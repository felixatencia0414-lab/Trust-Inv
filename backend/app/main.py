from __future__ import annotations

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session

from .database import init_db, get_session
from .routers.importaciones import router as importaciones_router
from .routers.inventarios import router as inventarios_router
from .routers.movimientos import router as movimientos_router
from .routers.parametros import router as parametros_router
from .routers.productos_tree import router as productos_tree_router
from .routers.auditoria import router as auditoria_router

app = FastAPI(title="Toma de Inventarios API", version="0.1.0")

# Lista explícita de dominios permitidos para evitar conflictos de seguridad con allow_credentials=True
origins = [
    "https://trust-inv-1.onrender.com",   # URL de tu Frontend en Render
    "https://trust-inv-app.onrender.com", # Por si acaso configuraste el otro nombre de dominio
    "http://localhost:5173",              # Tu entorno de desarrollo local con Vite
    "http://localhost:3000",              # Alternativa local común
]

# Configuración de CORS segura
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup() -> None:
    # Usar Alembic para crear tablas.
    # init_db() puede fallar si el modelo y las migraciones no están 100% sincronizados.
    pass

@app.get("/health")
def health() -> dict:
    return {"status": "ok"}

@app.get("/")
def hello_world() -> dict:
    return {"message": "Hello World"}

app.include_router(importaciones_router)
app.include_router(inventarios_router)
app.include_router(movimientos_router)
app.include_router(parametros_router)
app.include_router(productos_tree_router)
app.include_router(auditoria_router)

@app.get("/db-ping")
def db_ping(session: Session = Depends(get_session)) -> dict:
    # Lightweight query to verify DB connectivity.
    session.exec("SELECT 1")
    return {"db": "ok"}