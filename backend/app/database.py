from __future__ import annotations

import os

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

_DEFAULT_DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "vexdiagnostics.db")
DB_PATH = os.environ.get("VEXDIAG_DB_PATH", _DEFAULT_DB_PATH)
os.makedirs(os.path.dirname(os.path.abspath(DB_PATH)), exist_ok=True)

engine = create_engine(
    f"sqlite:///{os.path.abspath(DB_PATH)}",
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
