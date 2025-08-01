from fastapi import APIRouter, HTTPException
from models.schemas import DrugCheckRequest, InteractionResponse
from utils.data_loader import get_data
import itertools

router = APIRouter()

@router.post("/check-interactions/", summary="Check for drug-drug interactions", response_model=InteractionResponse)
def check_interactions(request: DrugCheckRequest):
    """
    Receives a list of drug names, checks for interactions, and returns the findings.
    """
    interactions_df, name_to_id, id_to_name = get_data()
    drug_names = request.drugs
    
    if len(drug_names) < 2:
        raise HTTPException(status_code=400, detail="Please provide at least two drugs to check.")

    # --- Interaction Logic ---

    # Step 1: Convert drug names to their standard DrugBank IDs
    drug_ids = [name_to_id.get(name.lower()) for name in drug_names]
    
    # Filter out any drugs that were not found in our synonym dictionary
    valid_ids = [drug_id for drug_id in drug_ids if drug_id]
    
    if len(valid_ids) < 2:
        raise HTTPException(status_code=404, detail="Could not identify at least two of the provided drugs in the database.")

    # Step 2: Check every possible pair of drugs for an interaction
    found_interactions = []
    # itertools.combinations creates all unique pairs from the list of IDs
    for id1, id2 in itertools.combinations(valid_ids, 2):
        # Search the DataFrame for a row where Drug1 ID and Drug2 ID match the pair
        # We need to check both (id1, id2) and (id2, id1) as the order isn't guaranteed
        interaction = interactions_df[
            ((interactions_df['Drug1 ID'] == id1) & (interactions_df['Drug2 ID'] == id2)) |
            ((interactions_df['Drug1 ID'] == id2) & (interactions_df['Drug2 ID'] == id1))
        ]
        
        if not interaction.empty:
            # If a match is found, extract the description
            description = interaction.iloc[0]['Interaction']
            drug1_name = id_to_name.get(id1, id1)
            drug2_name = id_to_name.get(id2, id2)
            
            # Replace placeholders in description with actual drug names
            if "(.*)" in description:
                description = description.replace("(.*)", drug1_name, 1).replace("(.*)", drug2_name, 1)
            
            found_interactions.append({
                "pair": sorted([drug1_name, drug2_name]),
                "description": description
            })

    # Step 3: Determine the overall safety and prepare the final response
    if found_interactions:
        is_safe = False
        message = f"Found {len(found_interactions)} potential interaction(s)."
    else:
        is_safe = True
        message = "No interactions found. This combination appears to be safe."

    return {
        "is_safe": is_safe,
        "message": message,
        "checked_drugs": [id_to_name.get(drug_id, "Unknown") for drug_id in valid_ids],
        "interactions": found_interactions
    }
