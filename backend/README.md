# Pictorigo Backend

Backend API for Pictorigo - constraint-driven sparse Structure-from-Motion.

## Development Setup

```bash
# Install dependencies
pip install -e .[dev]

# Run the development server
python main.py

# Run tests
pytest

# Lint and format
ruff check .
black .
mypy pictorigo/
```

## API Endpoints

- `GET /healthz` - Health check
- `GET /version` - Version information