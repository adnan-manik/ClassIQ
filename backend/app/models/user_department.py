"""ORM model for the public.user_departments junction table.

Links auth_users to departments — used to express "this HoD owns this department"
and "this teacher belongs to this department".
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class UserDepartment(Base):
    __tablename__ = "user_departments"

    auth_user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, ForeignKey("auth_users.id"), primary_key=True
    )
    department_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, ForeignKey("departments.id"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
