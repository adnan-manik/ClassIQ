"""Source adapters for the survey ingestion pipeline (BACKEND_ARCHITECTURE §5).

Every adapter normalises its input into a list of `InternalResponse`; the
pipeline in services/ingestion_service.py is unaware of the origin.
"""

from app.ingestion.types import IngestionIssue, InternalResponse, validate_response

__all__ = ["IngestionIssue", "InternalResponse", "validate_response"]
