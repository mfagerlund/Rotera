.PHONY: install install-dev ci test lint format clean

# Install production dependencies
install:
	cd backend && pip install -e .
	cd frontend && npm install --production

# Install development dependencies
install-dev:
	cd backend && pip install -e .[dev]
	cd frontend && npm install
	pre-commit install

# Run full CI pipeline locally
ci: lint test build

# Run tests
test:
	cd backend && pytest
	# Frontend tests would go here when added

# Run linting and type checking
lint:
	cd backend && ruff check . && black --check . && mypy pictorigo/
	cd frontend && npm run lint && npm run type-check

# Format code
format:
	cd backend && black . && ruff check --fix .
	cd frontend && npx prettier --write .

# Build frontend
build:
	cd frontend && npm run build

# Clean up
clean:
	rm -rf backend/dist backend/build backend/.pytest_cache
	rm -rf frontend/dist frontend/node_modules/.cache
	find . -name "*.pyc" -delete
	find . -name "__pycache__" -delete