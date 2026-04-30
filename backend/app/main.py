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


client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
MODEL = os.getenv("ANTHROPIC_MODEL", "claude-3-5-sonnet-20241022")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

supabase = None
if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY:
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

CACHE = {}


def get_user_id_from_request(request: Request):
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
    if not supabase or not user_id:
        return

    scores = data.get("scores", {})
    total_score = sum(scores.values()) if isinstance(scores, dict) else None

    supabase.table("essay_checks").insert({
        "user_id": user_id,
        "essay_text": payload.essay_text,
        "source_text": payload.source_text,
        "selected_topic": payload.selected_topic,
        "student_essay": payload.student_essay or payload.essay_text,
        "task_type": data.get("task_type", payload.task_type),
        "mode": payload.mode,
        "result_json": data,
        "content_score": data.get("official_content_score"),
        "total_score": total_score,
    }).execute()


@app.post("/check-essay", response_model=EssayResponse)
def check_essay(payload: EssayRequest, request: Request):
    if not os.getenv("ANTHROPIC_API_KEY"):
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY is not set")

    user_id = get_user_id_from_request(request)

    cache_key = payload.essay_text + payload.mode + str(payload.task_type)

    if cache_key in CACHE:
        cached_result = CACHE[cache_key]
        save_attempt(user_id, payload, cached_result.model_dump())
        return cached_result

    try:
        response = client.messages.create(
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

    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"LLM evaluation failed: {exc}")