from pydantic import BaseModel
from typing import List

class DrugCheckRequest(BaseModel):
    drugs: List[str]
    class Config:
        json_schema_extra = {
            "example": {
                "drugs": ["Aspirin", "Warfarin"]
            }
        }

class DrugInteraction(BaseModel):
    pair: List[str]
    description: str

class InteractionResponse(BaseModel):
    is_safe: bool
    message: str
    checked_drugs: List[str]
    interactions: List[DrugInteraction]

class DrugSearchResponse(BaseModel):
    found: bool
    primary_name: str = None
    drug_id: str = None
    search_term: str
    partial_matches: List[dict] = None
    message: str = None

class StatsResponse(BaseModel):
    total_drugs: int
    total_interactions: int
    database_info: dict
