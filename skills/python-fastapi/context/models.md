# FastAPI — Models

## Pydantic v2 Base Models

All request/response schemas should extend `BaseModel` from Pydantic v2:

```python
from pydantic import BaseModel, Field, EmailStr
from datetime import datetime

class UserBase(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr

class UserCreate(UserBase):
    password: str = Field(min_length=8)

class UserRead(UserBase):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}  # enables ORM mode
```

## Separate Schema Models from DB Models

Never use your ORM model as a request/response schema. Maintain separate models:

| Schema | Purpose |
|--------|---------|
| `UserBase` | Shared fields (name, email) |
| `UserCreate` | Fields needed to create (includes password) |
| `UserUpdate` | All fields optional for partial updates |
| `UserRead` | Fields returned to client (includes id, timestamps, excludes password) |

```python
class UserUpdate(BaseModel):
    name: str | None = None
    email: EmailStr | None = None

    model_config = {"extra": "forbid"}  # reject unknown fields
```

Use `model_config = {"extra": "forbid"}` on input schemas to reject unexpected fields — catches client bugs early.

## Field Validators

```python
from pydantic import field_validator, model_validator
import re

class UserCreate(BaseModel):
    username: str
    password: str
    password_confirm: str

    @field_validator("username")
    @classmethod
    def username_alphanumeric(cls, v: str) -> str:
        if not re.match(r"^[a-zA-Z0-9_]+$", v):
            raise ValueError("Username must be alphanumeric")
        return v.lower()  # normalize

    @model_validator(mode="after")
    def passwords_match(self) -> "UserCreate":
        if self.password != self.password_confirm:
            raise ValueError("Passwords do not match")
        return self
```

- `@field_validator` — validates/transforms a single field. Use `mode="before"` to run before Pydantic's own parsing.
- `@model_validator(mode="after")` — validates across multiple fields after all field validation.
- Always use `@classmethod` with `@field_validator`.

## Model Config

```python
class UserRead(BaseModel):
    model_config = {
        "from_attributes": True,       # read from ORM objects (replaces orm_mode)
        "extra": "forbid",             # reject extra fields
        "str_strip_whitespace": True,  # strip whitespace from all strings
        "json_schema_extra": {         # OpenAPI example
            "examples": [{"name": "Alice", "email": "alice@example.com"}]
        },
    }
```

## SQLAlchemy Integration

```python
# app/models/user.py
from sqlalchemy import String, DateTime
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from datetime import datetime

class Base(DeclarativeBase):
    pass

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
```

Use SQLAlchemy 2.0 style with `Mapped[]` and `mapped_column()` — not the legacy `Column()` syntax.

## SQLModel Alternative

SQLModel merges Pydantic + SQLAlchemy into one class. Useful for simpler projects:

```python
from sqlmodel import SQLModel, Field

class UserBase(SQLModel):
    name: str = Field(max_length=100)
    email: str = Field(unique=True, index=True)

class User(UserBase, table=True):
    id: int | None = Field(default=None, primary_key=True)
    hashed_password: str

class UserRead(UserBase):
    id: int
```

Trade-off: SQLModel is simpler but gives less control over DB schema details. For complex schemas with relationships, prefer separate SQLAlchemy models + Pydantic schemas.

## Serialization

```python
user = UserRead(id=1, name="Alice", email="alice@example.com", created_at=now)

user.model_dump()                          # dict
user.model_dump(exclude={"email"})         # dict without email
user.model_dump(exclude_none=True)         # omit None fields
user.model_dump_json()                     # JSON string
```

For database updates with partial data, use `model_dump(exclude_unset=True)` — this only includes fields the client explicitly sent, not fields defaulting to `None`.
