from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from utils.data_loader import load_data
from routes import interactions, search, health, verification, medical_files

# Load data once at startup
load_data()

# Create the FastAPI app instance
app = FastAPI(
    title="Drug Interaction Checker API",
    description="An API to check for interactions between a list of drugs using the DrugBank dataset.",
    version="1.0.0",
)

# Add debugging middleware to log all requests
@app.middleware("http")
async def log_requests(request: Request, call_next):
    print(f"Request: {request.method} {request.url}")
    print(f"Headers: {dict(request.headers)}")
    response = await call_next(request)
    print(f"Response status: {response.status_code}")
    return response

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for debugging
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include all routers
app.include_router(health.router, tags=["Health"])
app.include_router(interactions.router, prefix="/api/v1", tags=["Drug Interactions"])
app.include_router(search.router, prefix="/api/v1", tags=["Drug Search"])
app.include_router(verification.router, prefix="/api/v1", tags=["Prescription Verification"])
app.include_router(medical_files.router, prefix="/api/v1", tags=["Medical Files"])
