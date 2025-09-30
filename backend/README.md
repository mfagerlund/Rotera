# Pictorigo Backend API

FastAPI server for Pictorigo photogrammetry optimization.

## Structure

- `routers/` - API endpoints
  - `solve.py` - Optimization solver endpoints
  - `projects.py` - Project management endpoints
  - `synthetic.py` - Synthetic scene generation endpoints
- `main.py` - FastAPI application

## Dependencies

Uses the root `pictorigo` package for all optimization logic. The backend is a thin API layer that exposes the core optimization functionality via HTTP endpoints.

## Running

```bash
cd backend
uvicorn main:app --reload
```

The server will start on http://localhost:8000

API documentation is available at http://localhost:8000/docs
