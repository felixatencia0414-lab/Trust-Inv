from __future__ import annotations

import os
from typing import Generator
from urllib.parse import quote_plus

from sqlmodel import SQLModel, Session, create_engine

# Important for Windows console/psycopg2: keep pg client encoding stable.
os.environ["PGCLIENTENCODING"] = "utf-8"

# 1. Intentamos leer la URL directa completa (ideal para Supabase/Render en la nube)
DATABASE_URL_DIRECT = os.getenv("DATABASE_URL")

# ... (Tu código inicial de imports y lectura de DATABASE_URL_DIRECT se queda igual)

if DATABASE_URL_DIRECT:
    DATABASE_URL_DIRECT = DATABASE_URL_DIRECT.strip('"').strip("'")
    
    # 1. Si trae el parámetro de pgbouncer, lo removemos de la URL para que psycopg2 no falle
    if "?pgbouncer=true" in DATABASE_URL_DIRECT:
        DATABASE_URL_DIRECT = DATABASE_URL_DIRECT.replace("?pgbouncer=true", "")
    elif "&pgbouncer=true" in DATABASE_URL_DIRECT:
        DATABASE_URL_DIRECT = DATABASE_URL_DIRECT.replace("&pgbouncer=true", "")

    if DATABASE_URL_DIRECT.startswith("postgresql://"):
        DATABASE_URL = DATABASE_URL_DIRECT.replace("postgresql://", "postgresql+psycopg2://", 1)
    else:
        DATABASE_URL = DATABASE_URL_DIRECT
else:
    # 2. Si no existe en el entorno Cloud, armamos la URL local por defecto
    DB_USER = os.getenv("DB_USER", "postgres")
    DB_PASSWORD = os.getenv("DB_PASSWORD", "postgres123")
    DB_HOST = os.getenv("DB_HOST", "localhost")
    DB_PORT = os.getenv("DB_PORT", "5432")
    DB_NAME = os.getenv("DB_NAME", "inventarioszonas")

    DB_PASSWORD_ENC = quote_plus(DB_PASSWORD) if DB_PASSWORD else ""

    DATABASE_URL = (
        "postgresql+psycopg2://"
        f"{DB_USER}:{DB_PASSWORD_ENC}"
        f"@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    )

# Argumentos de conexión específicos para que no interfieran en local
connect_args = {}
if DATABASE_URL_DIRECT:
    # Le pasamos los parámetros de preparación de consultas requeridos por el Pooler de Supabase
    connect_args = {"prepare_threshold": 0}

# Configuración segura del motor
engine = create_engine(
    DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    pool_recycle=1800,
    pool_size=5,
    max_overflow=10,
    connect_args=connect_args, # Inyección limpia de argumentos para producción
)

# ... (Tus funciones get_session e init_db se quedan exactamente igual abajo)

def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session

def init_db() -> None:
    """Creates tables if they don't exist.

    Note: For production you should rely on Alembic migrations.
    """
    SQLModel.metadata.create_all(engine)