from __future__ import annotations

import os
from typing import Generator
from urllib.parse import quote_plus

from sqlmodel import SQLModel, Session, create_engine

# Important for Windows console/psycopg2: keep pg client encoding stable.
os.environ["PGCLIENTENCODING"] = "utf-8"

# 1. Intentamos leer la URL directa completa (ideal para Supabase/Render en la nube)
DATABASE_URL_DIRECT = os.getenv("DATABASE_URL")

if DATABASE_URL_DIRECT:
    # Si Render nos da la URL completa de Supabase, la usamos directamente.
    # Limpiamos posibles comillas accidentales que se copien del portapapeles
    DATABASE_URL_DIRECT = DATABASE_URL_DIRECT.strip('"').strip("'")
    
    # Se reemplaza postgresql:// por postgresql+psycopg2:// para usar el driver correcto en Python
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

# Configuración del motor de la base de datos optimizado para la nube y PgBouncer
engine = create_engine(
    DATABASE_URL,
    echo=False,
    pool_pre_ping=True,      # Verifica que la conexión esté viva antes de usarla (evita caídas)
    pool_recycle=1800,       # Recicla las conexiones cada 30 minutos
    pool_size=5,             # Tamaño del pool adecuado para planes compartidos
    max_overflow=10,         # Conexiones adicionales permitidas en picos de tráfico
)

def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session

def init_db() -> None:
    """Creates tables if they don't exist.

    Note: For production you should rely on Alembic migrations.
    """
    SQLModel.metadata.create_all(engine)