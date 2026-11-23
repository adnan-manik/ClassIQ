"""/api/public/forms — the no-account survey a student opens by code or link.

    GET  /api/public/forms/{code}            the form, ready to render
    POST /api/public/forms/{code}/identify   match the respondent; classmates list
    POST /api/public/forms/{code}/submit     store answers, profile, peers

No authentication. The tenant is taken only from the form the code resolves
to, never from the request. Unknown, draft, closed and expired codes all
return the same 404 so a code reveals nothing.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.forms import (
    IdentifyResponse,
    Identity,
    PublicForm,
    PublicSubmission,
    SubmitResponse,
)
from app.services import form_service as svc
from app.services.ingestion_service import IngestionError

router = APIRouter(prefix="/public/forms", tags=["public-forms"])

Code = Annotated[str, Path(min_length=4, max_length=16)]


async def _open(db: AsyncSession, code: str):
    try:
        return await svc.open_form(db, code)
    except svc.FormNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, svc.FORM_UNAVAILABLE) from exc


@router.get("/{code}", response_model=PublicForm)
async def get_public_form(code: Code, db: Annotated[AsyncSession, Depends(get_db)]) -> PublicForm:
    form = await _open(db, code)
    try:
        return await svc.public_form(db, form)
    except ValueError as exc:  # wording file removed after the form was saved
        raise HTTPException(status.HTTP_404_NOT_FOUND, svc.FORM_UNAVAILABLE) from exc


@router.post("/{code}/identify", response_model=IdentifyResponse)
async def identify(
    code: Code, body: Identity, db: Annotated[AsyncSession, Depends(get_db)]
) -> IdentifyResponse:
    form = await _open(db, code)
    try:
        return await svc.identify(db, form, body)
    except svc.IdentityError as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(exc)) from exc


@router.post("/{code}/submit", response_model=SubmitResponse)
async def submit(
    code: Code, body: PublicSubmission, db: Annotated[AsyncSession, Depends(get_db)]
) -> SubmitResponse:
    form = await _open(db, code)
    try:
        result = await svc.submit(db, form, body)
    except svc.IdentityError as exc:
        await db.rollback()
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(exc)) from exc
    except svc.AlreadySubmitted as exc:
        await db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, "You have already answered this survey."
        ) from exc
    except (svc.SubmissionError, IngestionError) as exc:
        await db.rollback()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    await db.commit()
    return result
