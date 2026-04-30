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


MODEL = os.getenv("ANTHROPIC_MODEL", "claude-3-5-sonnet-20241022")

_supabase_client = None


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
            max_tokens=1500,
            temperature=0.1,
            system=SYSTEM_PROMPT,
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

        raw = ""
        if response.content:
            for block in response.content:
                if hasattr(block, "text"):
                    raw += block.text

        clean = extract_json(raw)
        data = json.loads(clean)

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