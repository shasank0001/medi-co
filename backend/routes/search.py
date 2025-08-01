from fastapi import APIRouter
from models.schemas import DrugSearchResponse
from utils.data_loader import get_data

router = APIRouter()

@router.get("/search-drug/{drug_name}", summary="Search for a drug in the database", response_model=DrugSearchResponse)
def search_drug(drug_name: str):
    """
    Search for a drug name in the database and return possible matches.
    """
    interactions_df, name_to_id, id_to_name = get_data()
    drug_name_lower = drug_name.lower()
    
    # Exact match
    if drug_name_lower in name_to_id:
        drug_id = name_to_id[drug_name_lower]
        primary_name = id_to_name.get(drug_id, drug_id)
        return DrugSearchResponse(
            found=True,
            primary_name=primary_name,
            drug_id=drug_id,
            search_term=drug_name
        )
    
    # Partial matches
    partial_matches = []
    for name, drug_id in name_to_id.items():
        if drug_name_lower in name:
            primary_name = id_to_name.get(drug_id, drug_id)
            partial_matches.append({
                "drug_id": drug_id,
                "primary_name": primary_name,
                "matched_name": name
            })
    
    if partial_matches:
        return DrugSearchResponse(
            found=False,
            search_term=drug_name,
            partial_matches=partial_matches[:10],  # Limit to 10 results
            message=f"Found {len(partial_matches)} partial matches"
        )
    
    return DrugSearchResponse(
        found=False,
        search_term=drug_name,
        message="No matches found"
    )
