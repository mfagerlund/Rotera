"""FastAPI backend for Pictorigo."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pictorigo import __version__

from routers import projects, solve, synthetic

app = FastAPI(
    title="Pictorigo Backend",
    description="Constraint-driven sparse Structure-from-Motion API",
    version=__version__,
)

# Enable CORS for frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Frontend dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(projects.router)
app.include_router(solve.router)
app.include_router(synthetic.router)


@app.get("/healthz")
async def health_check() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "ok"}


@app.get("/version")
async def get_version() -> dict[str, str]:
    """Get version information."""
    return {"version": __version__}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000, reload=True)