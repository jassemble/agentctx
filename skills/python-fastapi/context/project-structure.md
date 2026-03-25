# FastAPI — Project Structure

## Canonical Directory Layout

```
├── app/
│   ├── __init__.py
│   ├── main.py                 # FastAPI app instance, lifespan, middleware
│   ├── config.py               # Settings via pydantic-settings
│   ├── dependencies.py         # Shared dependencies (DB session, auth, etc.)
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── auth.py
│   │   ├── users.py
│   │   └── posts.py
│   ├── models/                 # SQLAlchemy ORM models
│   │   ├── __init__.py
│   │   ├── base.py             # DeclarativeBase
│   │   └── user.py
│   ├── schemas/                # Pydantic request/response models
│   │   ├── __init__.py
│   │   └── user.py             # UserCreate, UserRead, UserUpdate
│   ├── services/               # Business logic layer
│   │   ├── __init__.py
│   │   └── user_service.py
│   └── utils/                  # Pure helpers (hashing, tokens, etc.)
│       └── security.py
├── alembic/                    # Database migrations
│   ├── versions/
│   └── env.py
├── tests/
│   ├── conftest.py             # Fixtures: TestClient, test DB
│   ├── test_users.py
│   └── test_auth.py
├── alembic.ini
├── pyproject.toml
└── .env
```

## Environment Config with pydantic-settings

```python
# app/config.py
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
    )

    database_url: str
    redis_url: str = "redis://localhost:6379"
    secret_key: str
    debug: bool = False
    cors_origins: list[str] = ["http://localhost:3000"]

settings = Settings()
```

Access settings via `from app.config import settings` — never read `os.environ` directly in application code.

## Database Session Dependency

```python
# app/dependencies.py
from collections.abc import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

engine = create_async_engine(settings.database_url)
async_session = async_sessionmaker(engine, expire_on_commit=False)

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
```

The session auto-commits on success and rolls back on exception. Every endpoint gets an isolated session via `Depends(get_db)`.

## Alembic Migrations

```bash
# Initialize (one-time)
alembic init alembic

# Generate migration from model changes
alembic revision --autogenerate -m "add users table"

# Apply migrations
alembic upgrade head

# Rollback one step
alembic downgrade -1
```

Configure `alembic/env.py` to import your `Base.metadata`:

```python
# alembic/env.py
from app.models.base import Base
target_metadata = Base.metadata
```

**Rule**: never modify a migration that has been applied to a shared database. Create a new migration instead.

## Testing

```python
# tests/conftest.py
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.dependencies import get_db

@pytest.fixture
async def client(test_db_session):
    app.dependency_overrides[get_db] = lambda: test_db_session
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac
    app.dependency_overrides.clear()

# tests/test_users.py
@pytest.mark.anyio
async def test_create_user(client: AsyncClient):
    response = await client.post("/users/", json={
        "name": "Alice",
        "email": "alice@example.com",
        "password": "securepass123",
    })
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "alice@example.com"
    assert "password" not in data
```

- Use `httpx.AsyncClient` with `ASGITransport` (not deprecated `TestClient` for async).
- Override dependencies with `app.dependency_overrides` to inject test DB sessions.
- Use `pytest-anyio` or `pytest-asyncio` for async test support.
- Test at the HTTP layer — call endpoints, not service functions directly. This tests routing, validation, serialization, and auth in one pass.

## Service Layer

Keep business logic out of route handlers. Route handlers should only:
1. Parse and validate input (FastAPI does this)
2. Call a service function
3. Return the response

```python
# app/services/user_service.py
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

async def create_user(db: AsyncSession, data: UserCreate) -> User:
    hashed = hash_password(data.password)
    user = User(name=data.name, email=data.email, hashed_password=hashed)
    db.add(user)
    await db.flush()       # get ID without committing (session commits in dependency)
    await db.refresh(user)
    return user
```

## Don't

- Don't put all routes in `main.py` — use `APIRouter` per domain and `include_router` in main
- Don't hardcode configuration — use pydantic-settings with `.env` files
- Don't create circular imports between routers and models — use dependency injection
- Don't mix sync and async code — if using async, go fully async (database, HTTP, file I/O)
- Don't skip alembic migrations — never modify database schema manually in production
