import json
import os

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from anthropic import Anthropic
from dotenv import load_dotenv
from supabase import create_client

try:
    from .schemas import EssayRequest, EssayResponse
    from .prompt import SYSTEM_PROMPT, build_user_prompt
except ImportError:
    from schemas import EssayRequest, EssayResponse
    from prompt import SYSTEM_PROMPT, build_user_prompt


load_dotenv()

app = FastAPI(title="OGE Essay Checker MVP")


allowed_origins_raw = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000"
)

allowed_origins = [
    origin.strip()
    for origin in allowed_origins_raw.split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6")
MAX_TOKENS = int(os.getenv("ANTHROPIC_MAX_TOKENS", "4000"))

_supabase_client = None


EVALUATION_TOOL = {
    "name": "return_essay_evaluation",
    "description": "Return the OGE essay evaluation as a structured object.",
    "input_schema": {
        "type": "object",
        "properties": {
            "task_type": {
                "type": "string",
                "enum": ["13.1", "13.2", "13.3"],
            },
            "word_count": {
                "type": "integer",
            },
            "evaluation_status": {
                "type": "string",
                "enum": ["OK", "NOT_EVALUATED", "ZERO_FOR_SK"],
            },
            "official_content_score": {
                "type": "integer",
            },
            "official_language_score_mode": {
                "type": "string",
            },
            "scores": {
                "type": "object",
                "properties": {
                    "СК1": {"type": "integer"},
                    "СК2": {"type": "integer"},
                    "СК3": {"type": "integer"},
                    "СК4": {"type": "integer"},
                    "ГК1": {"type": "integer"},
                    "ГК2": {"type": "integer"},
                    "ГК3": {"type": "integer"},
                    "ГК4": {"type": "integer"},
                    "ФК1": {"type": "integer"},
                },
                "required": [
                    "СК1",
                    "СК2",
                    "СК3",
                    "СК4",
                    "ГК1",
                    "ГК2",
                    "ГК3",
                    "ГК4",
                    "ФК1",
                ],
            },
            "errors": {
                "type": "object",
                "properties": {
                    "orthography": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                    "punctuation": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                    "grammar": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                    "speech": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                    "logic": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                    "facts": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                },
                "required": [
                    "orthography",
                    "punctuation",
                    "grammar",
                    "speech",
                    "logic",
                    "facts",
                ],
            },
            "analysis": {
                "type": "object",
                "properties": {
                    "СК1": {"type": "string"},
                    "СК2": {"type": "string"},
                    "СК3": {"type": "string"},
                    "СК4": {"type": "string"},
                    "ГК1": {"type": "string"},
                    "ГК2": {"type": "string"},
                    "ГК3": {"type": "string"},
                    "ГК4": {"type": "string"},
                    "ФК1": {"type": "string"},
                },
                "required": [
                    "СК1",
                    "СК2",
                    "СК3",
                    "СК4",
                    "ГК1",
                    "ГК2",
                    "ГК3",
                    "ГК4",
                    "ФК1",
                ],
            },
            "recommendations": {
                "type": "array",
                "items": {"type": "string"},
            },
            "annotated_text": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "fragment": {"type": "string"},
                        "issue": {"type": "string"},
                        "comment": {"type": "string"},
                    },
                    "required": ["fragment", "issue", "comment"],
                },
            },
        },
        "required": [
            "task_type",
            "word_count",
            "evaluation_status",
            "official_content_score",
            "official_language_score_mode",
            "scores",
            "errors",
            "analysis",
            "recommendations",
            "annotated_text",
        ],
    },
}


def extract_json(text: str) -> str:
    text = text.strip()

    if text.startswith("```json"):
        text = text.replace("```json", "", 1).strip()

    if text.startswith("```"):
        text = text.replace("```", "", 1).strip()

    if text.endswith("```"):
        text = text[:-3].strip()

    start = text.find("{")
    end = text.rfind("}")

    if start == -1 or end == -1:
        raise ValueError("JSON не найден в ответе модели")

    return text[start:end + 1]


def extract_structured_result(response) -> dict:
    raw_text = ""

    if response.content:
        for block in response.content:
            block_type = getattr(block, "type", None)

            if block_type == "tool_use" and getattr(block, "name", None) == "return_essay_evaluation":
                data = getattr(block, "input", None)

                if isinstance(data, dict):
                    return data

            if hasattr(block, "text"):
                raw_text += block.text

    if raw_text:
        clean = extract_json(raw_text)
        return json.loads(clean)

    raise ValueError("Модель не вернула структурированный результат проверки")


def get_anthropic_client() -> Anthropic:
    api_key = os.getenv("ANTHROPIC_API_KEY")

    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="ANTHROPIC_API_KEY is not set"
        )

    return Anthropic(api_key=api_key)


def get_supabase_client():
    global _supabase_client

    if _supabase_client:
        return _supabase_client

    supabase_url = os.getenv("SUPABASE_URL")
    supabase_service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url or not supabase_service_role_key:
        return None

    try:
        _supabase_client = create_client(
            supabase_url,
            supabase_service_role_key
        )
        return _supabase_client
    except Exception:
        return None


def get_user_id_from_request(request: Request):
    supabase = get_supabase_client()

    if not supabase:
        return None

    auth_header = request.headers.get("authorization")

    if not auth_header:
        return None

    token = auth_header.replace("Bearer ", "").strip()

    if not token:
        return None

    try:
        user_response = supabase.auth.get_user(token)
        return user_response.user.id
    except Exception:
        return None


def save_attempt(user_id: str | None, payload: EssayRequest, data: dict):
    supabase = get_supabase_client()

    if not supabase or not user_id:
        return

    scores = data.get("scores", {})
    total_score = sum(scores.values()) if isinstance(scores, dict) else None

    student_essay = getattr(payload, "student_essay", None) or payload.essay_text

    try:
        supabase.table("essay_checks").insert({
            "user_id": user_id,
            "essay_text": payload.essay_text,
            "source_text": getattr(payload, "source_text", None),
            "selected_topic": getattr(payload, "selected_topic", None),
            "student_essay": student_essay,
            "task_type": data.get("task_type", payload.task_type),
            "mode": payload.mode,
            "result_json": data,
            "content_score": data.get("official_content_score"),
            "total_score": total_score,
        }).execute()
    except Exception:
        return


CACHE = {}


@app.post("/check-essay", response_model=EssayResponse)
def check_essay(payload: EssayRequest, request: Request):
    user_id = get_user_id_from_request(request)

    cache_key = json.dumps(
        {
            "essay_text": payload.essay_text,
            "mode": payload.mode,
            "task_type": payload.task_type,
        },
        ensure_ascii=False,
        sort_keys=True,
    )

    if cache_key in CACHE:
        cached_result = CACHE[cache_key]
        save_attempt(user_id, payload, cached_result.model_dump())
        return cached_result

    try:
        anthropic_client = get_anthropic_client()

        response = anthropic_client.messages.create(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            temperature=0.1,
            system=SYSTEM_PROMPT,
            tools=[EVALUATION_TOOL],
            tool_choice={
                "type": "tool",
                "name": "return_essay_evaluation",
            },
            messages=[
                {
                    "role": "user",
                    "content": build_user_prompt(
                        payload.essay_text,
                        payload.task_type,
                        payload.mode,
                    ),
                },
            ],
        )

        data = extract_structured_result(response)

        result = EssayResponse.model_validate(data)

        CACHE[cache_key] = result

        save_attempt(user_id, payload, data)

        return result

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"LLM evaluation failed: {exc}"
        )