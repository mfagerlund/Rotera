"""FastAPI backend for Pictorigo."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

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
    import argparse
    import time

    import uvicorn

    parser = argparse.ArgumentParser(description="Run Pictorigo backend server")
    parser.add_argument(
        "--test", action="store_true", help="Run in test mode with slow startup"
    )
    parser.add_argument("--port", type=int, default=8000, help="Port to run server on")
    args = parser.parse_args()

    if args.test:
        print("Running in test mode - slow startup (10 seconds delay)")
        print("Press Ctrl+C to cancel...")
        for i in range(10, 0, -1):
            print(f"Starting in {i}...")
            time.sleep(1)
        print("Starting server...")

    uvicorn.run("main:app", host="127.0.0.1", port=args.port, reload=True)
