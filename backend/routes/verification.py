from fastapi import APIRouter, HTTPException
from models.schemas import PrescriptionVerificationRequest, VerificationResponse, DrugInteraction
from utils.data_loader import get_data
import itertools
import os
import google.generativeai as genai
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()


# In a real application, you would use the official Google AI client library
# import google.generativeai as genai
# genai.configure(api_key=os.environ["GEMINI_API_KEY"])

router = APIRouter()

def _check_drug_interactions(drug_names: list[str]) -> list[DrugInteraction]:
    """
    Internal function to check for interactions between a list of drugs.
    This is a simplified version of the logic in interactions.py for internal use.
    """
    interactions_df, name_to_id, id_to_name = get_data()
    
    drug_ids = [name_to_id.get(name.lower()) for name in drug_names]
    valid_ids = [drug_id for drug_id in drug_ids if drug_id]
    
    if len(valid_ids) < 2:
        return []

    found_interactions = []
    for id1, id2 in itertools.combinations(valid_ids, 2):
        interaction = interactions_df[
            ((interactions_df['Drug1 ID'] == id1) & (interactions_df['Drug2 ID'] == id2)) |
            ((interactions_df['Drug1 ID'] == id2) & (interactions_df['Drug2 ID'] == id1))
        ]
        
        if not interaction.empty:
            description = interaction.iloc[0]['Interaction']
            drug1_name = id_to_name.get(id1, id1)
            drug2_name = id_to_name.get(id2, id2)
            
            found_interactions.append(DrugInteraction(
                pair=sorted([drug1_name, drug2_name]),
                description=description
            ))
    return found_interactions

import json

def _call_generative_ai(prompt: str) -> str | None:
    """
    Makes a real API call to the Google Generative AI (Gemini) model.

    Args:
        prompt: The input text prompt for the AI model.

    Returns:
        The text response from the model, or None if an error occurs.
    """
    try:
        print("Attempting to call Gemini AI...")
        api_key = os.getenv("GEMINI_API_KEY")
        
        if not api_key:
            print("GEMINI_API_KEY environment variable not found")
            return None
            
        print(f"API key found: {api_key[:10]}...")
        
        # The client automatically looks for the GEMINI_API_KEY environment variable.
        genai.configure(api_key=api_key)

        # Initialize the model
        model = genai.GenerativeModel('gemini-1.5-flash-latest')
        print("Model initialized successfully")

        # Generate content and return the text
        print("Sending prompt to AI...")
        response = model.generate_content(prompt)
        print(f"AI response received, length: {len(response.text) if response.text else 0}")
        return response.text

    except Exception as e:
        print(f"Error in _call_generative_ai: {e}")
        print(f"Error type: {type(e)}")
        import traceback
        traceback.print_exc()
        return None

@router.post("/verify-prescription/", summary="Verify a prescription using AI", response_model=VerificationResponse)
async def verify_prescription(request: PrescriptionVerificationRequest):
    """
    Receives a full prescription context, checks for drug-drug interactions,
    and uses a generative AI to provide a comprehensive safety analysis.
    """
    print(f"Received verification request for {len(request.drugs)} drugs")
    
    drug_names = [drug.name for drug in request.drugs]
    
    if len(drug_names) < 1:
        raise HTTPException(status_code=400, detail="Please provide at least one drug.")

    # Step 1: Check for internal drug-drug interactions
    interactions = _check_drug_interactions(drug_names)
    
    # Step 2: Construct a detailed prompt for the generative AI
    prompt = f"""
    You are a clinical pharmacist AI assistant. Your task is to analyze a patient's prescription for potential issues.
    Provide your response in a structured JSON format.

    **Patient Information:**
    - Age: {request.patient_age}
    - Gender: {request.patient_gender}
    - Clinical Context: {request.clinical_context}

    **Prescribed Medications:**
    {chr(10).join([f"- {d.name} (Dosage: {d.dosage}, Frequency: {d.frequency})" for d in request.drugs])}

    **Known Drug-Drug Interactions (from internal database):**
    {chr(10).join([f"- {' & '.join(i.pair)}: {i.description}" for i in interactions]) if interactions else "No critical interactions found in the internal database."}

    **Analysis Task:**
    Based on all the information provided (patient details, clinical context, and known interactions), perform a comprehensive analysis.
    Identify any potential problems, such as:
    - Inappropriate dosage for the patient's age.
    - Contraindications based on the clinical context.
    - Redundant therapies.
    - Other potential risks not covered by the simple drug-drug interaction check.

    **Output Format:**
    Respond with a single JSON object with the following structure:
    {{
      "overall": "'green' | 'yellow' | 'red'",
      "alerts": [{{ "severity": "'critical' | 'advisory'", "message": "...", "recommendation": "..." }}],
      "alternatives": [{{ "drug": "...", "reason": "...", "notes": "..." }}]
    }}
    - 'overall': Your summary assessment ('green' for safe, 'yellow' for caution, 'red' for high-risk).
    - 'alerts': A list of specific issues you identified.
    - 'alternatives': Suggested alternative medications, if applicable.
    
    If no issues are found, return an 'overall' status of 'green' with an empty 'alerts' array.
    """

    # Step 3: Call the AI model and parse the response
    try:
        ai_response_text = _call_generative_ai(prompt)
        print(f"AI Response received: {ai_response_text}")
        
        if ai_response_text is None:
            print("AI response is None - API call failed")
            raise HTTPException(status_code=500, detail="AI service unavailable")
        
        # Try to parse the AI response as JSON
        try:
            # Clean the AI response - remove markdown code blocks if present
            cleaned_response = ai_response_text.strip()
            if cleaned_response.startswith('```json'):
                cleaned_response = cleaned_response[7:]  # Remove ```json
            if cleaned_response.startswith('```'):
                cleaned_response = cleaned_response[3:]   # Remove ```
            if cleaned_response.endswith('```'):
                cleaned_response = cleaned_response[:-3]  # Remove ending ```
            
            cleaned_response = cleaned_response.strip()
            print(f"Cleaned response: {cleaned_response}")
            
            response_json = json.loads(cleaned_response)
            print(f"Parsed JSON successfully: {response_json}")
            response_data = VerificationResponse(**response_json)
            return response_data
        except (json.JSONDecodeError, ValueError) as json_error:
            print(f"JSON parsing error: {json_error}")
            print(f"Raw AI Response: {repr(ai_response_text)}")
            raise HTTPException(status_code=500, detail=f"Invalid AI response format: {json_error}")
            
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        print(f"Unexpected error in verify_prescription: {e}")
        print(f"Error type: {type(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

