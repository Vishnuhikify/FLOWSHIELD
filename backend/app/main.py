"""FLOWSHIELD FastAPI application entry point."""
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.mapping import InputError
from app.api.routes import router

app = FastAPI(title="FLOWSHIELD API", version="0.9.0")

# Vite dev server origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _error(status: int, type_: str, message: str, details: list[dict]) -> JSONResponse:
    """Every API error has the same shape so the frontend needs one handler."""
    return JSONResponse(status_code=status,
                        content={"error": {"type": type_, "message": message, "details": details}})


@app.exception_handler(RequestValidationError)
async def schema_error(_: Request, exc: RequestValidationError) -> JSONResponse:
    details = [{"field": ".".join(str(p) for p in e["loc"] if p != "body") or "body",
                "message": e["msg"]} for e in exc.errors()]
    return _error(422, "validation_error", "Request body is not valid", details)


@app.exception_handler(InputError)
async def input_error(_: Request, exc: InputError) -> JSONResponse:
    return _error(422, "validation_error", exc.message, [{"field": exc.field, "message": exc.message}])


@app.exception_handler(FloatingPointError)
async def numeric_error(_: Request, exc: FloatingPointError) -> JSONResponse:
    return _error(500, "simulation_error", str(exc), [])


app.include_router(router)
