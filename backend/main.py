from fastapi import FastAPI
from utils.data_loader import load_data
from routes import interactions, search, health

# Load data once at startup
load_data()

# Create the FastAPI app instance
app = FastAPI(
    title="Drug Interaction Checker API",
    description="An API to check for interactions between a list of drugs using the DrugBank dataset.",
    version="1.0.0",
)

# Include all routers
app.include_router(health.router, tags=["Health"])
app.include_router(interactions.router, prefix="/api/v1", tags=["Drug Interactions"])
app.include_router(search.router, prefix="/api/v1", tags=["Drug Search"])
