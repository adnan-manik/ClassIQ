"""/api/scenarios — F5 what-if scenario testing.

    GET    /api/scenarios                      list
    POST   /api/scenarios                      create
    POST   /api/scenarios/from-section/{id}    clone a live section into a new scenario
    GET    /api/scenarios/{id}                 detail (sections + rosters + latest results)
    PATCH  /api/scenarios/{id}                 rename / replace sections
    DELETE /api/scenarios/{id}
    POST   /api/scenarios/{id}/simulate        score every scenario section
    GET    /api/scenarios/{id}/compare         side-by-side vs the live baseline
    POST   /api/scenarios/{id}/apply           copy onto live sections + re-score
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.deps import require_role
from app.models.auth_user import AuthUser, UserRole
from app.models.scenario import Scenario
from app.repositories import scenarios as repo
from app.schemas.scenarios import (
    ScenarioApplyResponse,
    ScenarioCloneRequest,
    ScenarioCompareResponse,
    ScenarioCreate,
    ScenarioDetail,
    ScenarioListItem,
    ScenarioSimulateResponse,
    ScenarioUpdate,
)
from app.services import scenario_service as svc

router = APIRouter(prefix="/scenarios", tags=["scenarios"])

_staff = require_role(UserRole.hod, UserRole.institution_admin, UserRole.super_admin)


async def _load(db: AsyncSession, user: AuthUser, scenario_id: UUID) -> Scenario:
    scenario = await repo.get_scenario(db, user.institution_id, scenario_id)
    if scenario is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Scenario not found")
    return scenario


@router.get("", response_model=list[ScenarioListItem])
async def list_scenarios(
    user: Annotated[AuthUser, Depends(_staff)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[ScenarioListItem]:
    rows = await repo.list_scenarios(db, user.institution_id)
    return await svc.build_list_items(db, rows)


@router.post("", response_model=ScenarioDetail, status_code=status.HTTP_201_CREATED)
async def create_scenario(
    body: ScenarioCreate,
    user: Annotated[AuthUser, Depends(_staff)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ScenarioDetail:
    try:
        scenario = await svc.create_scenario(
            db, institution_id=user.institution_id, user_id=user.id, body=body
        )
    except svc.ScenarioError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return await svc.build_detail(db, scenario)


@router.post(
    "/from-section/{section_id}",
    response_model=ScenarioDetail,
    status_code=status.HTTP_201_CREATED,
)
async def clone_from_section(
    section_id: UUID,
    user: Annotated[AuthUser, Depends(_staff)],
    db: Annotated[AsyncSession, Depends(get_db)],
    body: ScenarioCloneRequest | None = None,
) -> ScenarioDetail:
    try:
        scenario = await svc.clone_from_section(
            db,
            institution_id=user.institution_id,
            user_id=user.id,
            section_id=section_id,
            name=body.name if body else None,
        )
    except svc.ScenarioError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return await svc.build_detail(db, scenario)


@router.get("/{scenario_id}", response_model=ScenarioDetail)
async def get_scenario(
    scenario_id: UUID,
    user: Annotated[AuthUser, Depends(_staff)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ScenarioDetail:
    scenario = await _load(db, user, scenario_id)
    return await svc.build_detail(db, scenario)


@router.patch("/{scenario_id}", response_model=ScenarioDetail)
async def update_scenario(
    scenario_id: UUID,
    body: ScenarioUpdate,
    user: Annotated[AuthUser, Depends(_staff)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ScenarioDetail:
    scenario = await _load(db, user, scenario_id)
    try:
        scenario = await svc.update_scenario(
            db,
            institution_id=user.institution_id,
            user_id=user.id,
            scenario=scenario,
            body=body,
        )
    except svc.ScenarioError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return await svc.build_detail(db, scenario)


@router.delete("/{scenario_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_scenario(
    scenario_id: UUID,
    user: Annotated[AuthUser, Depends(_staff)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    scenario = await _load(db, user, scenario_id)
    await svc.delete_scenario(
        db, institution_id=user.institution_id, user_id=user.id, scenario=scenario
    )


@router.post("/{scenario_id}/simulate", response_model=ScenarioSimulateResponse)
async def simulate_scenario(
    scenario_id: UUID,
    user: Annotated[AuthUser, Depends(_staff)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ScenarioSimulateResponse:
    scenario = await _load(db, user, scenario_id)
    try:
        return await svc.simulate_scenario(
            db, institution_id=user.institution_id, user_id=user.id, scenario=scenario
        )
    except svc.ScenarioError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc


@router.get("/{scenario_id}/compare", response_model=ScenarioCompareResponse)
async def compare_scenario(
    scenario_id: UUID,
    user: Annotated[AuthUser, Depends(_staff)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ScenarioCompareResponse:
    scenario = await _load(db, user, scenario_id)
    return await svc.compare_scenario(
        db, institution_id=user.institution_id, scenario=scenario
    )


@router.post("/{scenario_id}/apply", response_model=ScenarioApplyResponse)
async def apply_scenario(
    scenario_id: UUID,
    user: Annotated[AuthUser, Depends(_staff)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ScenarioApplyResponse:
    scenario = await _load(db, user, scenario_id)
    try:
        return await svc.apply_scenario(
            db, institution_id=user.institution_id, user_id=user.id, scenario=scenario
        )
    except svc.ScenarioError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
