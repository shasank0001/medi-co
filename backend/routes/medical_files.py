from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import JSONResponse
from models.schemas import (
    MedicalFile, PatientProfile, FileUploadResponse, 
    FileSummaryRequest, FileSummaryResponse
)
import os
import json
import uuid
import re
from datetime import datetime
from typing import List, Optional
import google.generativeai as genai
from dotenv import load_dotenv
from utils.database import (
    init_database, add_patient_to_db, get_all_patient_ids, 
    get_patient_info, update_patient_activity, patient_exists_in_db
)

# Load environment variables
load_dotenv()

router = APIRouter()

# Simple in-memory storage for files (SQLite only stores patient IDs)
STORAGE_DIR = "medical_files"
PATIENTS_DB = {}  # patient_id -> PatientProfile (still in memory for file data)
FILES_DB = {}     # file_id -> MedicalFile

# Ensure storage directory exists and initialize database
os.makedirs(STORAGE_DIR, exist_ok=True)
init_database()

def extract_text_from_file(file_content: bytes, filename: str) -> str:
    """Extract text content from uploaded file"""
    print(f"🔍 Starting text extraction for file: {filename}")
    print(f"📊 File size: {len(file_content)} bytes")
    print(f"🔤 File extension: {os.path.splitext(filename)[1].lower()}")
    
    try:
        # For text files
        if filename.lower().endswith('.txt'):
            print("📝 Processing as text file")
            text = file_content.decode('utf-8')
            print(f"✅ Text file extracted successfully. Length: {len(text)} characters")
            return text
        
        # For PDFs - use PyPDF2 for proper text extraction
        if filename.lower().endswith('.pdf'):
            print("📄 Processing as PDF file with PyPDF2")
            try:
                import PyPDF2
                from io import BytesIO
                
                # Create a BytesIO object from the file content
                pdf_file = BytesIO(file_content)
                pdf_reader = PyPDF2.PdfReader(pdf_file)
                
                print(f"� PDF has {len(pdf_reader.pages)} pages")
                
                # Extract text from all pages
                extracted_text = ""
                for page_num, page in enumerate(pdf_reader.pages):
                    try:
                        page_text = page.extract_text()
                        if page_text.strip():
                            extracted_text += f"\n--- Page {page_num + 1} ---\n"
                            extracted_text += page_text
                            print(f"� Extracted text from page {page_num + 1}: {len(page_text)} characters")
                        else:
                            print(f"⚠️ Page {page_num + 1} appears to be empty or image-based")
                    except Exception as e:
                        print(f"❌ Error extracting text from page {page_num + 1}: {str(e)}")
                
                if extracted_text.strip():
                    # Enhanced cleanup for medical documents
                    extracted_text = extracted_text.strip()
                    
                    # Clean up common PDF artifacts while preserving medical formatting
                    # Remove excessive whitespace but keep paragraph structure
                    extracted_text = re.sub(r'\n\s*\n\s*\n+', '\n\n', extracted_text)  # Max 2 line breaks
                    extracted_text = re.sub(r'[ \t]+', ' ', extracted_text)  # Normalize spaces
                    extracted_text = re.sub(r'\n ', '\n', extracted_text)  # Remove space after newlines
                    
                    # Remove common PDF extraction artifacts
                    lines = extracted_text.split('\n')
                    cleaned_lines = []
                    
                    for line in lines:
                        line = line.strip()
                        # Skip very short lines that are likely artifacts (but keep meaningful short lines)
                        if len(line) > 1 or line in ['-', '•', '*']:
                            # Remove standalone numbers that are likely page numbers
                            if not (line.isdigit() and len(line) <= 3):
                                cleaned_lines.append(line)
                    
                    # Rejoin with proper spacing for medical documents
                    final_text = '\n'.join(cleaned_lines)
                    
                    # Limit to reasonable size but keep more for medical documents (increased from 5000)
                    if len(final_text) > 15000:
                        final_text = final_text[:15000]
                        final_text += "\n\n[Document truncated for processing...]"
                    
                    print(f"✅ PyPDF2 extraction successful. Final text length: {len(final_text)} characters")
                    print(f"📄 First 300 chars of extracted text: {final_text[:300]}...")
                    return final_text
                else:
                    error_msg = f"[PDF file '{filename}' processed but no readable text found. This may be a scanned document or image-based PDF. Please use a text-based PDF or convert to text format for better AI analysis.]"
                    print(f"⚠️ No text extracted from PDF: {error_msg}")
                    return error_msg
                    
            except ImportError:
                print("❌ PyPDF2 not available, falling back to basic extraction")
                # Fallback to the old method if PyPDF2 is not available
                text = file_content.decode('latin-1', errors='ignore')
                print(f"🔄 Decoded PDF content length: {len(text)} characters")
                
                # Try to extract text between common PDF text markers
                import re
                text_matches = re.findall(r'\(([^)]+)\)', text)
                print(f"� Found {len(text_matches)} text matches in parentheses")
                
                if text_matches:
                    extracted = ' '.join(text_matches)
                    extracted = re.sub(r'[^\w\s\.,;:!?-]', ' ', extracted)
                    extracted = ' '.join(extracted.split())
                    print(f"🧹 Cleaned extracted text length: {len(extracted)} characters")
                    
                    if len(extracted) > 50:
                        final_text = extracted[:5000]
                        print(f"✅ Fallback extraction successful. Final text length: {len(final_text)} characters")
                        return final_text
                
                error_msg = f"[PDF file '{filename}' uploaded but text extraction requires PyPDF2 library. Please use a text file for better AI analysis.]"
                print(f"❌ PDF extraction failed: {error_msg}")
                return error_msg
            
            except Exception as e:
                error_msg = f"[PDF processing failed for '{filename}'. Error: {str(e)}. Please try a different PDF or use a text file.]"
                print(f"❌ PDF processing error: {error_msg}")
                return error_msg
        
        # For other formats, try basic text extraction
        print("📄 Processing as generic file")
        text = file_content.decode('utf-8', errors='ignore')
        
        # Basic cleanup
        text = ''.join(char for char in text if char.isprintable() or char.isspace())
        text = ' '.join(text.split())  # Normalize whitespace
        
        final_text = text[:5000]  # Limit to first 5000 characters
        print(f"✅ Generic extraction successful. Final text length: {len(final_text)} characters")
        print(f"📄 First 200 chars: {final_text[:200]}...")
        return final_text
        
    except Exception as e:
        error_msg = f"[Text extraction failed for {filename}. For best results, please upload text files (.txt) or text-based PDF documents. Error: {str(e)}]"
        print(f"❌ Text extraction error: {error_msg}")
        return error_msg

def generate_ai_summary(text: str, summary_type: str = "comprehensive") -> dict:
    """Generate AI summary of medical text"""
    try:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            return {
                "summary": "AI summarization unavailable - API key not configured",
                "key_findings": [],
                "recommendations": []
            }
        
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-1.5-flash-latest')
        
        prompt = f"""
        You are a medical AI assistant. Analyze the following medical document and provide a structured summary.
        
        Document content:
        {text}
        
        Please provide your response in the following JSON format:
        {{
            "summary": "A comprehensive summary of the medical document",
            "key_findings": ["Finding 1", "Finding 2", "Finding 3"],
            "recommendations": ["Recommendation 1", "Recommendation 2"]
        }}
        
        Focus on:
        - Medical conditions and diagnoses
        - Test results and lab values
        - Medications and treatments
        - Important dates and timelines
        - Risk factors and concerns
        """
        
        response = model.generate_content(prompt)
        
        # Clean and parse the response
        response_text = response.text.strip()
        if response_text.startswith('```json'):
            response_text = response_text[7:]
        if response_text.startswith('```'):
            response_text = response_text[3:]
        if response_text.endswith('```'):
            response_text = response_text[:-3]
        
        response_text = response_text.strip()
        
        try:
            return json.loads(response_text)
        except json.JSONDecodeError:
            return {
                "summary": response_text,
                "key_findings": ["AI analysis completed"],
                "recommendations": ["Please review the summary above"]
            }
            
    except Exception as e:
        return {
            "summary": f"AI summarization failed: {str(e)}",
            "key_findings": [],
            "recommendations": ["Manual review recommended"]
        }

@router.get("/patients", summary="Get all patients")
async def get_patients():
    """Get list of all patients from database"""
    try:
        # Get patient IDs from SQLite database
        patient_ids = get_all_patient_ids()
        
        patients_list = []
        for patient_id in patient_ids:
            # Get basic info from database
            db_info = get_patient_info(patient_id)
            
            # Get detailed info from memory (if exists) or create basic profile
            if patient_id in PATIENTS_DB:
                patient_profile = PATIENTS_DB[patient_id]
                patients_list.append({
                    "patient_id": patient_id,
                    "name": patient_profile.name,
                    "age": patient_profile.age,
                    "gender": patient_profile.gender,
                    "file_count": len(patient_profile.medical_files),
                    "last_activity": db_info.get("last_activity") if db_info else None
                })
            else:
                # Patient exists in database but no files uploaded yet
                patients_list.append({
                    "patient_id": patient_id,
                    "name": db_info.get("name", f"Patient {patient_id}") if db_info else f"Patient {patient_id}",
                    "age": 0,
                    "gender": "unknown",
                    "file_count": 0,
                    "last_activity": db_info.get("last_activity") if db_info else None
                })
        
        print(f"✅ Retrieved {len(patients_list)} patients for doctor view")
        return {"patients": patients_list}
        
    except Exception as e:
        print(f"❌ Failed to get patients: {str(e)}")
        return {"patients": []}

@router.get("/doctor/patients", summary="Get all patients for doctor view")
async def get_patients_for_doctor():
    """Get comprehensive list of all patients for doctor interface"""
    try:
        # Get all patient IDs from database
        patient_ids = get_all_patient_ids()
        
        patients_data = []
        for patient_id in patient_ids:
            # Get database info
            db_info = get_patient_info(patient_id)
            
            # Get memory info if available
            if patient_id in PATIENTS_DB:
                patient = PATIENTS_DB[patient_id]
                file_count = len(patient.medical_files)
                latest_files = [
                    {
                        "filename": f.filename,
                        "upload_date": f.upload_date,
                        "file_type": f.file_type
                    } 
                    for f in patient.medical_files[-3:]  # Last 3 files
                ]
            else:
                file_count = 0
                latest_files = []
            
            patients_data.append({
                "patient_id": patient_id,
                "name": db_info.get("name", f"Patient {patient_id}") if db_info else f"Patient {patient_id}",
                "file_count": file_count,
                "last_activity": db_info.get("last_activity") if db_info else None,
                "created_at": db_info.get("created_at") if db_info else None,
                "latest_files": latest_files,
                "has_files": file_count > 0
            })
        
        # Sort by last activity (most recent first)
        patients_data.sort(key=lambda x: x.get("last_activity", ""), reverse=True)
        
        print(f"✅ Retrieved {len(patients_data)} patients for doctor dashboard")
        return {
            "patients": patients_data,
            "total_patients": len(patients_data),
            "patients_with_files": sum(1 for p in patients_data if p["has_files"])
        }
        
    except Exception as e:
        print(f"❌ Failed to get patients for doctor: {str(e)}")
        return {"patients": [], "total_patients": 0, "patients_with_files": 0}

@router.get("/patients/{patient_id}", summary="Get patient profile")
async def get_patient_profile(patient_id: str):
    """Get specific patient profile with files"""
    if patient_id not in PATIENTS_DB:
        raise HTTPException(status_code=404, detail="Patient not found")
    return PATIENTS_DB[patient_id]

@router.post("/patients/{patient_id}/files/upload", summary="Upload medical file")
async def upload_medical_file(
    patient_id: str,
    file: UploadFile = File(...),
    category: str = Form("general"),
    description: str = Form("")
):
    """Upload a medical file for a patient"""
    print(f"🚀 Starting file upload for patient: {patient_id}")
    print(f"📁 File name: {file.filename}")
    print(f"📝 File content type: {file.content_type}")
    print(f"📋 Category: {category}")
    print(f"📄 Description: {description}")
    
    try:
        # Validate file type
        allowed_extensions = {'.pdf', '.txt', '.doc', '.docx', '.jpg', '.png'}
        file_ext = os.path.splitext(file.filename)[1].lower()
        print(f"🔍 Detected file extension: {file_ext}")
        
        if file_ext not in allowed_extensions:
            print(f"❌ File type not allowed: {file_ext}")
            raise HTTPException(
                status_code=400, 
                detail=f"File type {file_ext} not allowed. Supported: {', '.join(allowed_extensions)}"
            )
        
        # Validate file size (10MB limit)
        content = await file.read()
        file_size = len(content)
        print(f"📊 File size: {file_size} bytes ({file_size / 1024:.1f} KB)")
        
        if file_size > 10 * 1024 * 1024:
            print(f"❌ File too large: {file_size} bytes")
            raise HTTPException(status_code=400, detail="File too large. Maximum size: 10MB")
        
        # Generate unique file ID
        file_id = str(uuid.uuid4())
        print(f"🆔 Generated file ID: {file_id}")
        
        # Save file to disk
        file_path = os.path.join(STORAGE_DIR, f"{file_id}_{file.filename}")
        with open(file_path, "wb") as f:
            f.write(content)
        print(f"💾 File saved to: {file_path}")
        
        # Extract text content
        print("🔍 Starting text extraction...")
        extracted_text = extract_text_from_file(content, file.filename)
        print(f"✅ Text extraction completed. Length: {len(extracted_text)} characters")
        
        # Generate AI summary
        print("🤖 Starting AI summary generation...")
        ai_analysis = generate_ai_summary(extracted_text)
        print(f"✅ AI summary generated: {ai_analysis.get('summary', 'No summary')[:100]}...")
        
        # Create file record
        medical_file = MedicalFile(
            id=file_id,
            patient_id=patient_id,
            filename=file.filename,
            file_type=file_ext,
            upload_date=datetime.now().isoformat(),
            file_size=len(content),
            extracted_text=extracted_text,
            ai_summary=json.dumps(ai_analysis)
        )
        
        # Store in database
        FILES_DB[file_id] = medical_file
        print(f"💾 File record stored in FILES_DB")
        
        # Update patient profile
        if patient_id not in PATIENTS_DB:
            PATIENTS_DB[patient_id] = PatientProfile(
                patient_id=patient_id,
                name=f"Patient {patient_id}",
                age=0,
                gender="unknown",
                medical_files=[]
            )
            print(f"👤 Created new patient profile for: {patient_id}")
        
        # Add patient to SQLite database
        add_patient_to_db(patient_id, PATIENTS_DB[patient_id].name)
        
        PATIENTS_DB[patient_id].medical_files.append(medical_file)
        print(f"📁 Added file to patient's medical files list")
        
        # Update patient activity in database
        update_patient_activity(patient_id)
        
        print(f"🎉 Upload completed successfully for file: {file.filename}")
        return FileUploadResponse(
            success=True,
            message=f"File uploaded successfully for patient {patient_id}",
            file_id=file_id,
            extracted_text=extracted_text[:500] + "..." if len(extracted_text) > 500 else extracted_text
        )
        
    except Exception as e:
        print(f"❌ Upload failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

@router.get("/patients/{patient_id}/files", summary="Get patient files")
async def get_patient_files(patient_id: str):
    """Get all files for a patient"""
    if patient_id not in PATIENTS_DB:
        return {"files": []}
    
    return {"files": PATIENTS_DB[patient_id].medical_files}

@router.post("/patients/{patient_id}/summary", summary="Generate comprehensive patient summary")
async def generate_patient_summary(patient_id: str, summary_request: FileSummaryRequest):
    """Generate AI summary of patient's medical files"""
    print(f"🤖 Starting summary generation for patient: {patient_id}")
    print(f"📋 Summary type: {summary_request.summary_type}")
    print(f"📁 Requested file IDs: {summary_request.file_ids}")
    
    if patient_id not in PATIENTS_DB:
        print(f"❌ Patient not found: {patient_id}")
        raise HTTPException(status_code=404, detail="Patient not found")
    
    patient = PATIENTS_DB[patient_id]
    print(f"👤 Found patient with {len(patient.medical_files)} files")
    
    # Get files to summarize
    files_to_process = []
    if summary_request.file_ids:
        files_to_process = [f for f in patient.medical_files if f.id in summary_request.file_ids]
        print(f"📁 Processing specific files: {len(files_to_process)} files")
    else:
        files_to_process = patient.medical_files
        print(f"📁 Processing all files: {len(files_to_process)} files")
    
    if not files_to_process:
        print("❌ No files found to summarize")
        raise HTTPException(status_code=404, detail="No files found to summarize")
    
    # Combine all extracted text
    combined_text = ""
    processed_files = []
    
    for i, file in enumerate(files_to_process):
        print(f"📄 Processing file {i+1}/{len(files_to_process)}: {file.filename}")
        print(f"📊 File text length: {len(file.extracted_text) if file.extracted_text else 0} characters")
        
        if file.extracted_text:
            combined_text += f"\n\n--- {file.filename} (uploaded: {file.upload_date}) ---\n"
            combined_text += file.extracted_text
            processed_files.append(file.filename)
            print(f"✅ Added text from {file.filename}")
        else:
            print(f"⚠️ No extracted text found for {file.filename}")
    
    print(f"📝 Combined text length: {len(combined_text)} characters")
    print(f"📄 First 300 characters of combined text: {combined_text[:300]}...")
    
    if not combined_text.strip():
        print("❌ No text content found in any files")
        raise HTTPException(status_code=400, detail="No text content found in files")
    
    # Generate comprehensive summary
    try:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            print("❌ GEMINI_API_KEY not found")
            raise HTTPException(status_code=500, detail="AI service not available")
        
        print("🤖 Calling Gemini AI for summary generation...")
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-1.5-flash-latest')
        
        summary_prompts = {
            "comprehensive": f"""
            Analyze the following medical records for patient {patient_id} and provide a comprehensive medical summary.
            
            Medical Records:
            {combined_text}
            
            Provide a structured analysis in JSON format:
            {{
                "summary": "Comprehensive medical history and current status",
                "key_findings": ["Important medical findings", "Test results", "Diagnoses"],
                "recommendations": ["Treatment recommendations", "Follow-up care", "Monitoring needs"],
                "medical_history": "Chronological medical history",
                "current_medications": "Current medications if mentioned",
                "recent_tests": "Recent test results and lab values",
                "risk_factors": "Identified risk factors and concerns"
            }}
            """,
            "brief": f"""
            Provide a brief medical summary for patient {patient_id} based on these records:
            
            {combined_text}
            
            JSON format:
            {{
                "summary": "Brief overview of patient's medical status",
                "key_findings": ["Top 3-5 most important findings"],
                "recommendations": ["Essential recommendations"]
            }}
            """,
            "medications": f"""
            Focus on medication history and management for patient {patient_id}:
            
            {combined_text}
            
            JSON format:
            {{
                "summary": "Medication history and current prescriptions",
                "key_findings": ["Current medications", "Medication changes", "Drug interactions"],
                "recommendations": ["Medication management recommendations"]
            }}
            """
        }
        
        prompt = summary_prompts.get(summary_request.summary_type, summary_prompts["comprehensive"])
        response = model.generate_content(prompt)
        
        # Clean and parse response
        response_text = response.text.strip()
        if response_text.startswith('```json'):
            response_text = response_text[7:]
        if response_text.startswith('```'):
            response_text = response_text[3:]
        if response_text.endswith('```'):
            response_text = response_text[:-3]
        
        response_text = response_text.strip()
        
        try:
            analysis = json.loads(response_text)
            return FileSummaryResponse(
                summary=analysis.get("summary", "Summary generated"),
                files_processed=processed_files,
                key_findings=analysis.get("key_findings", []),
                recommendations=analysis.get("recommendations", [])
            )
        except json.JSONDecodeError:
            return FileSummaryResponse(
                summary=response_text,
                files_processed=processed_files,
                key_findings=["AI analysis completed"],
                recommendations=["Please review the summary above"]
            )
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Summary generation failed: {str(e)}")

@router.delete("/files/{file_id}", summary="Delete medical file")
async def delete_medical_file(file_id: str):
    """Delete a medical file"""
    if file_id not in FILES_DB:
        raise HTTPException(status_code=404, detail="File not found")
    
    file_record = FILES_DB[file_id]
    
    # Remove from patient's file list
    if file_record.patient_id in PATIENTS_DB:
        PATIENTS_DB[file_record.patient_id].medical_files = [
            f for f in PATIENTS_DB[file_record.patient_id].medical_files if f.id != file_id
        ]
    
    # Remove file from disk
    try:
        file_path = os.path.join(STORAGE_DIR, f"{file_id}_{file_record.filename}")
        if os.path.exists(file_path):
            os.remove(file_path)
    except Exception:
        pass  # Continue even if file deletion fails
    
    # Remove from database
    del FILES_DB[file_id]
    
    return {"success": True, "message": "File deleted successfully"}

@router.post("/patients/{patient_id}/profile", summary="Update patient profile")
async def update_patient_profile(patient_id: str, name: str = Form(...), age: int = Form(...), gender: str = Form(...)):
    """Update patient profile information"""
    if patient_id not in PATIENTS_DB:
        PATIENTS_DB[patient_id] = PatientProfile(
            patient_id=patient_id,
            name=name,
            age=age,
            gender=gender,
            medical_files=[]
        )
    else:
        PATIENTS_DB[patient_id].name = name
        PATIENTS_DB[patient_id].age = age
        PATIENTS_DB[patient_id].gender = gender
    
    # Update patient in SQLite database
    add_patient_to_db(patient_id, name)
    update_patient_activity(patient_id)
    
    return {"success": True, "message": "Patient profile updated successfully"}

@router.post("/patients/register", summary="Register new patient")
async def register_new_patient(
    name: str = Form(...),
    age: int = Form(...),
    gender: str = Form(...),
    email: str = Form(None),
    phone: str = Form(None)
):
    """Register a new patient and return their unique ID"""
    print(f"👤 Registering new patient: {name}")
    print(f"📝 Age: {age}, Gender: {gender}")
    print(f"📞 Email: {email}, Phone: {phone}")
    
    try:
        # Generate unique patient ID
        patient_id = f"P{str(uuid.uuid4())[:8].upper()}"
        print(f"🆔 Generated patient ID: {patient_id}")
        
        # Check if ID already exists (very unlikely but safe check)
        while patient_exists_in_db(patient_id):
            patient_id = f"P{str(uuid.uuid4())[:8].upper()}"
            print(f"🔄 ID collision, generated new ID: {patient_id}")
        
        # Create new patient profile
        new_patient = PatientProfile(
            patient_id=patient_id,
            name=name,
            age=age,
            gender=gender,
            medical_files=[]
        )
        
        # Store in memory
        PATIENTS_DB[patient_id] = new_patient
        print(f"💾 Patient stored in memory")
        
        # Add to SQLite database
        add_patient_to_db(patient_id, name)
        print(f"💾 Patient added to SQLite database")
        
        print(f"✅ Patient {patient_id} registered successfully")
        return {
            "success": True,
            "message": f"Patient registered successfully",
            "patient_id": patient_id,
            "patient": {
                "patient_id": patient_id,
                "name": name,
                "age": age,
                "gender": gender,
                "email": email,
                "phone": phone,
                "file_count": 0,
                "registration_date": datetime.now().isoformat()
            }
        }
        
    except Exception as e:
        print(f"❌ Failed to register patient: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to register patient: {str(e)}")

@router.post("/patients/{patient_id}/chat", summary="Chat with AI about patient")
async def chat_with_ai_about_patient(
    patient_id: str,
    question: str = Form(...),
    context_type: str = Form("all")  # "all", "recent", "specific"
):
    """
    Chat with AI about a specific patient's medical records
    Doctor can ask questions about the patient's condition, treatment, etc.
    """
    print(f"💬 Doctor asking question about patient {patient_id}")
    print(f"❓ Question: {question}")
    print(f"📋 Context type: {context_type}")
    
    try:
        # Check if patient exists
        if patient_id not in PATIENTS_DB:
            print(f"❌ Patient not found: {patient_id}")
            raise HTTPException(status_code=404, detail="Patient not found")
        
        patient = PATIENTS_DB[patient_id]
        print(f"👤 Found patient with {len(patient.medical_files)} files")
        
        if not patient.medical_files:
            return {
                "response": f"I don't have any medical files for patient {patient_id} yet. Please upload some medical documents first to enable AI chat functionality.",
                "context_used": "No files available"
            }
        
        # Gather context from patient's medical files
        context_text = ""
        files_used = []
        
        # Get patient basic info
        patient_info = f"Patient ID: {patient_id}\nName: {patient.name}\nAge: {patient.age}\nGender: {patient.gender}\n\n"
        
        # Add medical files content
        for file in patient.medical_files:
            if file.extracted_text and file.extracted_text.strip():
                context_text += f"\n--- Medical File: {file.filename} (Date: {file.upload_date}) ---\n"
                context_text += file.extracted_text
                files_used.append(file.filename)
                
                # Add AI summary if available
                if file.ai_summary:
                    try:
                        ai_data = json.loads(file.ai_summary)
                        if isinstance(ai_data, dict) and ai_data.get('summary'):
                            context_text += f"\n[AI Analysis of {file.filename}]: {ai_data['summary']}\n"
                    except:
                        pass
        
        if not context_text.strip():
            return {
                "response": "I don't have readable text content from the uploaded files. Please ensure files contain text that can be extracted for AI analysis.",
                "context_used": "No readable content"
            }
        
        # Check API key availability
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            return {
                "response": "AI chat service is currently unavailable. Please contact system administrator.",
                "context_used": "API unavailable"
            }
        
        # Generate AI response
        print("🤖 Calling Gemini AI for chat response...")
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-1.5-flash-latest')
        
        chat_prompt = f"""
        You are an AI medical assistant helping a doctor understand a patient's medical records. 
        
        Patient Information:
        {patient_info}
        
        Available Medical Records:
        {context_text}
        
        Doctor's Question: {question}
        
        Please provide a helpful, accurate response based on the medical records provided. 
        - Focus on factual information from the records
        - If the question cannot be answered from the available records, say so clearly
        - Provide medical insights while noting that this is AI analysis, not a substitute for professional medical judgment
        - Be concise but thorough
        - If recommending further tests or treatments, note that these are suggestions based on the records
        
        Response:
        """
        
        response = model.generate_content(chat_prompt)
        ai_response = response.text.strip()
        
        print(f"✅ AI chat response generated successfully")
        print(f"📄 Files used for context: {', '.join(files_used)}")
        
        return {
            "response": ai_response,
            "context_used": f"Based on {len(files_used)} medical files: {', '.join(files_used)}",
            "patient_info": {
                "patient_id": patient_id,
                "name": patient.name,
                "file_count": len(patient.medical_files)
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Chat failed: {str(e)}")
        return {
            "response": f"Sorry, I encountered an error while processing your question: {str(e)}. Please try again.",
            "context_used": "Error occurred"
        }
