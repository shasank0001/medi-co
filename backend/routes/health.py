from fastapi import APIRouter
from models.schemas import StatsResponse
from utils.data_loader import get_data

router = APIRouter()

@router.get("/", summary="API Health Check")
def read_root():
    """A simple endpoint to confirm the API is running."""
    return {"status": "Drug Interaction API is running."}

@router.get("/stats", summary="Database Statistics", response_model=StatsResponse)
def get_stats():
    """Get statistics about the loaded database."""
    interactions_df, name_to_id, id_to_name = get_data()
    
    return StatsResponse(
        total_drugs=len(id_to_name),
        total_interactions=len(interactions_df),
        database_info={
            "interaction_file": "all_id_interaction.csv",
            "synonyms_file": "drugs_synonyms.json"
        }
    )
