import sqlite3
import os
from typing import List, Optional
from datetime import datetime

# Database file path
DB_PATH = "patients.db"

def init_database():
    """Initialize the SQLite database with patients table"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Create patients table - simple table just for patient IDs
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS patients (
                patient_id TEXT PRIMARY KEY,
                name TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        conn.commit()
        conn.close()
        print(f"✅ Database initialized successfully at {DB_PATH}")
        return True
        
    except Exception as e:
        print(f"❌ Database initialization failed: {str(e)}")
        return False

def add_patient_to_db(patient_id: str, name: str = None) -> bool:
    """Add a patient ID to the database"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Insert or update patient
        cursor.execute('''
            INSERT OR REPLACE INTO patients (patient_id, name, last_activity)
            VALUES (?, ?, ?)
        ''', (patient_id, name or f"Patient {patient_id}", datetime.now()))
        
        conn.commit()
        conn.close()
        print(f"✅ Patient {patient_id} added/updated in database")
        return True
        
    except Exception as e:
        print(f"❌ Failed to add patient {patient_id}: {str(e)}")
        return False

def get_all_patient_ids() -> List[str]:
    """Get all patient IDs from the database"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        cursor.execute('SELECT patient_id FROM patients ORDER BY last_activity DESC')
        patient_ids = [row[0] for row in cursor.fetchall()]
        
        conn.close()
        print(f"✅ Retrieved {len(patient_ids)} patient IDs from database")
        return patient_ids
        
    except Exception as e:
        print(f"❌ Failed to get patient IDs: {str(e)}")
        return []

def get_patient_info(patient_id: str) -> Optional[dict]:
    """Get patient info from database"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT patient_id, name, created_at, last_activity 
            FROM patients WHERE patient_id = ?
        ''', (patient_id,))
        
        row = cursor.fetchone()
        conn.close()
        
        if row:
            return {
                "patient_id": row[0],
                "name": row[1],
                "created_at": row[2],
                "last_activity": row[3]
            }
        return None
        
    except Exception as e:
        print(f"❌ Failed to get patient info for {patient_id}: {str(e)}")
        return None

def update_patient_activity(patient_id: str):
    """Update last activity timestamp for a patient"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        cursor.execute('''
            UPDATE patients SET last_activity = ? WHERE patient_id = ?
        ''', (datetime.now(), patient_id))
        
        conn.commit()
        conn.close()
        
    except Exception as e:
        print(f"❌ Failed to update activity for {patient_id}: {str(e)}")

def patient_exists_in_db(patient_id: str) -> bool:
    """Check if patient exists in database"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        cursor.execute('SELECT 1 FROM patients WHERE patient_id = ?', (patient_id,))
        exists = cursor.fetchone() is not None
        
        conn.close()
        return exists
        
    except Exception as e:
        print(f"❌ Failed to check patient existence: {str(e)}")
        return False

# Initialize database on import
if __name__ == "__main__":
    init_database()
