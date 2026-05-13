"""Shared Pydantic shapes used across multiple routers."""

from pydantic import BaseModel, ConfigDict


class APIModel(BaseModel):
    """Base — allows reading attributes from SQLAlchemy ORM objects."""

    model_config = ConfigDict(from_attributes=True)
