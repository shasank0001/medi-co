import pandas as pd
import json

# Global variables to store data
interactions_df = None
name_to_id = None
id_to_name = None

def load_data():
    """
    Loads the drug interaction and synonym datasets into memory.
    This function is called once at startup.
    """
    global interactions_df, name_to_id, id_to_name
    
    try:
        # Load the main interaction dataset
        # This file contains pairs of DrugBank IDs and the interaction description.
        interactions_df = pd.read_csv('dataset/data_final_v5.csv')
        
        # Clean the drug IDs by removing 'Compound::' prefix
        interactions_df['Drug1'] = interactions_df['Drug1'].str.replace('Compound::', '')
        interactions_df['Drug2'] = interactions_df['Drug2'].str.replace('Compound::', '')
        
        # Rename columns to match expected format
        interactions_df = interactions_df.rename(columns={'Drug1': 'Drug1 ID', 'Drug2': 'Drug2 ID'})
        
        # Load the synonyms dictionary
        # This file maps various drug names (brand, generic) to a single DrugBank ID.
        with open('dataset/drugs_synonyms.json', 'r') as f:
            synonyms = json.load(f)

        # Create a reverse mapping from drug name (lowercase) to DrugBank ID for easy lookup
        name_to_id = {name.lower(): drug_id for drug_id, names in synonyms.items() for name in names}

        # For user-friendly output, create a mapping from ID back to a primary name
        id_to_name = {drug_id: names[0] for drug_id, names in synonyms.items()}
        
        print("Datasets loaded successfully.")
        print(f"Loaded {len(interactions_df)} interactions and {len(name_to_id)} drug mappings.")
        return interactions_df, name_to_id, id_to_name
        
    except FileNotFoundError as e:
        print(f"ERROR: A required data file was not found: {e.filename}")
        print("Please download 'drug_interactions.csv' and 'drugs_synonyms.json' from Kaggle.")
        # Stop the application if data files are missing
        raise RuntimeError("Missing data files, API cannot start.") from e

def get_data():
    """Returns the loaded data"""
    return interactions_df, name_to_id, id_to_name
