# FastAPI — Endpoints

## Router Organization

Split endpoints into routers by domain. Each router lives in its own file:

```python
# app/routers/users.py
from fastapi import APIRouter, Depends, HTTPException, status

router = APIRouter(prefix="/users", tags=["users"])

@router.get("/", response_model=list[UserRead])
async def list_users(
    skip: int = 0,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
):
    return await user_service.list_users(db, skip=skip, limit=limit)

@router.get("/{user_id}", response_model=UserRead)
async def get_user(user_id: int, db: AsyncSession = Depends(get_db)):
    user = await user_service.get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user
```

```python
# app/main.py
from fastapi import FastAPI
from app.routers import users, posts, auth

app = FastAPI()
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(posts.router)
```

## Dependency Injection

Use `Depends()` for shared logic — DB sessions, auth, pagination, rate limiting:

```python
# app/dependencies.py
from typing import Annotated
from fastapi import Depends, Header, HTTPException

async def get_current_user(
    authorization: Annotated[str, Header()],
    db: AsyncSession = Depends(get_db),
) -> User:
    token = authorization.removeprefix("Bearer ")
    user = await auth_service.verify_token(db, token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user

CurrentUser = Annotated[User, Depends(get_current_user)]

# Usage in endpoint
@router.get("/me", response_model=UserRead)
async def get_me(user: CurrentUser):
    return user
```

Use `Annotated[Type, Depends(dep)]` (Python 3.9+) instead of `param: Type = Depends(dep)` — it's cleaner and supports reuse via type aliases.

## Parameter Patterns

```python
from fastapi import Path, Query, Body

@router.get("/items/{item_id}")
async def get_item(
    item_id: int = Path(gt=0, description="The item ID"),           # path param
    q: str | None = Query(None, max_length=50),                      # query param
    include_deleted: bool = Query(False),                             # query flag
):
    ...

@router.post("/items/")
async def create_item(
    item: ItemCreate,                                                 # body (auto)
    priority: int = Body(default=0, ge=0, le=10),                    # extra body field
):
    ...
```

- Path params are **required** by default — use `Path()` for validation only.
- Pydantic models in function signatures are automatically parsed as **request body**.
- A single Pydantic model param → flat body. Multiple params → nested JSON object.

## Response Models and Status Codes

```python
@router.post("/users/", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def create_user(data: UserCreate, db: AsyncSession = Depends(get_db)):
    return await user_service.create_user(db, data)

@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(user_id: int, db: AsyncSession = Depends(get_db)):
    await user_service.delete_user(db, user_id)
```

Always set `response_model` — it strips unexpected fields, validates output, and generates accurate OpenAPI docs.

## Lifespan Events

Use the lifespan context manager (not deprecated `on_event`):

```python
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup — initialize connections, load models
    app.state.db_pool = await create_pool()
    yield
    # Shutdown — clean up
    await app.state.db_pool.close()

app = FastAPI(lifespan=lifespan)
```

## CORS Configuration

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://myapp.com"],     # never use ["*"] in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

Add CORS middleware **before** other middleware — middleware executes in reverse order of registration.

## Don't

- Don't use `def` for endpoints that do I/O — use `async def` with async database/HTTP clients
- Don't put business logic directly in endpoint functions — extract to service functions
- Don't return raw database models from endpoints — use response schemas to control what's exposed
- Don't use `*` imports from models/schemas — import explicitly
- Don't forget to add `response_model` — it validates output and generates OpenAPI docs
