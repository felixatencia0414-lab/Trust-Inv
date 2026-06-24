from logging.config import fileConfig
import os
import sys
from os.path import abspath, dirname
from urllib.parse import quote_plus

from sqlalchemy import engine_from_config, pool
from alembic import context
from sqlmodel import SQLModel

# 1. Asegurar que la raíz del proyecto esté en el sys.path
sys.path.insert(0, dirname(dirname(abspath(__file__))))

# 2. CRUCIAL: Importar el engine y TODOS tus modelos para que queden registrados en el Metadata
from app.database import engine
# Cambia 'TomaInventoryMadre' por 'TomaInventarioMadre'
from app.models import Categoria, SubCategoria, Producto, InventarioValorizado, TomaInventarioMadre, ZonaInventario, ConteoZonaDetalle

# Configuración del objeto de Alembic
config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Asignamos el metadata que ya contiene los modelos importados arriba
target_metadata = SQLModel.metadata

os.environ["PGCLIENTENCODING"] = "utf-8"

def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    # Intentar obtener la URL desde las variables de entorno o construirla si falta en alembic.ini
    url = config.get_main_option("sqlalchemy.url")
    if not url:
        DB_USER = os.getenv("DB_USER", "postgres")
        DB_PASSWORD = os.getenv("DB_PASSWORD", "postgres123")
        DB_HOST = os.getenv("DB_HOST", "localhost")
        DB_PORT = os.getenv("DB_PORT", "5432")
        DB_NAME = os.getenv("DB_NAME", "inventarioszonas")
        DB_PASSWORD_ENC = quote_plus(DB_PASSWORD) if DB_PASSWORD else ""
        url = f"postgresql://{DB_USER}:{DB_PASSWORD_ENC}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    # 3. CORRECCIÓN: Usamos directamente el 'engine' importado de tu app.database
    # Esto garantiza que use las mismas credenciales y la misma BD que tu FastAPI
    connectable = engine

    with connectable.connect() as connection:
        context.configure(
            connection=connection, 
            target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()