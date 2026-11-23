"""/api/forms — staff build and manage shareable survey forms.

    GET    /api/forms                                  this institution's forms
    GET    /api/forms/meta                             wordings, relation types, question kinds
    POST   /api/forms                                  create (status draft, code generated)
    GET    /api/forms/{id}
    PATCH  /api/forms/{id}                             edit settings / open / close
    POST   /api/forms/{id}/code                        issue a new code (old link stops working)
    DELETE /api/forms/{id}                             soft delete
    GET    /api/forms/{id}/submissions
    POST   /api/forms/{id}/submissions/{sid}/void      undo one submission's effects
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.deps import require_role
from app.ingestion.ils_instrument import available_wordings
from app.models.auth_user import AuthUser, UserRole
from app.models.peer_relationship import RelationshipType
from app.models.survey_form import SurveyForm
from app.schemas.forms import (
    DEFAULT_PEER_OPTIONS,
    FormCreate,
    FormMeta,
    FormShape,
    FormUpdate,
    PeerOption,
    SubmissionShape,
)
from app.services import form_service as svc

router = APIRouter(prefix="/forms", tags=["forms"])

_staff = require_role(UserRole.hod, UserRole.institution_admin, UserRole.super_admin)


async def _form_or_404(db: AsyncSession, user: AuthUser, form_id: UUID) -> SurveyForm:
    form = await svc.get_form(db, user.institution_id, form_id)
    if form is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Form not found")
    return form


async def _shape(db: AsyncSession, form: SurveyForm) -> FormShape:
    counts = await svc.submission_counts(db, [form.id])
    return svc.form_shape(form, counts.get(form.id, 0))


@router.get("", response_model=list[FormShape])
async def list_forms(
    user: Annotated[AuthUser, Depends(_staff)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[FormShape]:
    return await svc.list_forms(db, user.institution_id)


@router.get("/meta", response_model=FormMeta)
async def form_meta(_user: Annotated[AuthUser, Depends(_staff)]) -> FormMeta:
    return FormMeta(
        wordings=available_wordings(),
        relationship_types=[t.value for t in RelationshipType],
        question_kinds=["short_text", "long_text", "single_choice", "multi_choice", "scale", "number"],
        default_peer_options=[PeerOption(**o) for o in DEFAULT_PEER_OPTIONS],
    )


@router.post("", response_model=FormShape, status_code=status.HTTP_201_CREATED)
async def create_form(
    body: FormCreate,
    user: Annotated[AuthUser, Depends(_staff)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FormShape:
    try:
        form = await svc.create_form(
            db, institution_id=user.institution_id, user_id=user.id, settings=body.model_dump()
        )
    except svc.FormError as exc:
        await db.rollback()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    await db.commit()
    return svc.form_shape(form)


@router.get("/{form_id}", response_model=FormShape)
async def get_form(
    form_id: UUID,
    user: Annotated[AuthUser, Depends(_staff)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FormShape:
    return await _shape(db, await _form_or_404(db, user, form_id))


@router.patch("/{form_id}", response_model=FormShape)
async def update_form(
    form_id: UUID,
    body: FormUpdate,
    user: Annotated[AuthUser, Depends(_staff)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FormShape:
    form = await _form_or_404(db, user, form_id)
    try:
        await svc.update_form(
            db, form=form, user_id=user.id, changes=body.model_dump(exclude_unset=True)
        )
    except svc.FormError as exc:
        await db.rollback()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    await db.commit()
    return await _shape(db, form)


@router.post("/{form_id}/code", response_model=FormShape)
async def regenerate_code(
    form_id: UUID,
    user: Annotated[AuthUser, Depends(_staff)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FormShape:
    form = await _form_or_404(db, user, form_id)
    try:
        await svc.regenerate_code(db, form=form, user_id=user.id)
    except svc.FormError as exc:
        await db.rollback()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    await db.commit()
    return await _shape(db, form)


@router.delete("/{form_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_form(
    form_id: UUID,
    user: Annotated[AuthUser, Depends(_staff)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    form = await _form_or_404(db, user, form_id)
    await svc.delete_form(db, form=form, user_id=user.id)
    await db.commit()


@router.get("/{form_id}/submissions", response_model=list[SubmissionShape])
async def list_submissions(
    form_id: UUID,
    user: Annotated[AuthUser, Depends(_staff)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[SubmissionShape]:
    return await svc.list_submissions(db, await _form_or_404(db, user, form_id))


@router.post("/{form_id}/submissions/{submission_id}/void", status_code=status.HTTP_204_NO_CONTENT)
async def void_submission(
    form_id: UUID,
    submission_id: UUID,
    user: Annotated[AuthUser, Depends(_staff)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    form = await _form_or_404(db, user, form_id)
    try:
        await svc.void_submission(db, form=form, submission_id=submission_id, user_id=user.id)
    except svc.FormError as exc:
        await db.rollback()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    await db.commit()
