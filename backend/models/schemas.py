from pydantic import BaseModel
from typing import List, Optional

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

# --- New Models for Prescription Verification ---

class DrugDetail(BaseModel):
    name: str
    dosage: str
    frequency: str

class PrescriptionVerificationRequest(BaseModel):
    patient_age: int
    patient_gender: str
    clinical_context: str
    drugs: List[DrugDetail]

class Alert(BaseModel):
    severity: str  # 'critical' or 'advisory'
    message: str
    recommendation: str

class Alternative(BaseModel):
    drug: str
    reason: str
    notes: str

class VerificationResponse(BaseModel):
    overall: str  # 'green', 'yellow', or 'red'
    alerts: List[Alert]
    alternatives: Optional[List[Alternative]] = None

# --- Medical File Management Models ---

class MedicalFile(BaseModel):
    id: str
    patient_id: str
    filename: str
    file_type: str
    upload_date: str
    file_size: int
    extracted_text: Optional[str] = None
    ai_summary: Optional[str] = None

class PatientProfile(BaseModel):
    patient_id: str
    name: str
    age: int
    gender: str
    medical_files: List[MedicalFile] = []

class FileUploadResponse(BaseModel):
    success: bool
    message: str
    file_id: Optional[str] = None
    extracted_text: Optional[str] = None

class FileSummaryRequest(BaseModel):
    file_ids: Optional[List[str]] = None  # None or empty list means all files
    summary_type: str = "comprehensive"  # "brief", "comprehensive", "specific"

class FileSummaryResponse(BaseModel):
    summary: str
    files_processed: List[str]
    key_findings: List[str]
    recommendations: List[str]
