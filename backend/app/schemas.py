from pydantic import BaseModel
from typing import Dict, List, Literal, Optional


class EssayRequest(BaseModel):
    essay_text: str
    task_type: str = "auto"
    mode: str = "diagnostic"

    source_text: Optional[str] = None
    selected_topic: Optional[str] = None
    student_essay: Optional[str] = None


class AnnotatedTextItem(BaseModel):
    fragment: str
    issue: str
    comment: str


class EssayResponse(BaseModel):
    task_type: Literal["13.1", "13.2", "13.3"]
    word_count: int
    evaluation_status: str
    official_content_score: int
    official_language_score_mode: str
    scores: Dict[str, int]
    errors: Dict[str, List[str]]
    analysis: Dict[str, str]
    recommendations: List[str]
    annotated_text: List[AnnotatedTextItem]