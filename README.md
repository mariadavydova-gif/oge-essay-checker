# OGE Essay Checker MVP

MVP сервиса: ученик вставляет сочинение ОГЭ 13.1/13.2/13.3, backend отправляет текст и официальные критерии в LLM, frontend показывает баллы, ошибки, разбор, рекомендации и подсветку.

## Структура

```txt
backend/
  app/main.py       # FastAPI, endpoint /check-essay
  app/prompt.py     # системный prompt и место для официальных критериев
  app/schemas.py    # Pydantic JSON-контракт
  requirements.txt
frontend/
  app/page.tsx      # UI проверки
  app/styles.css
  package.json
```

## Важно перед запуском

Откройте `backend/app/prompt.py` и вставьте полный официальный текст критериев ФИПИ в блок `ОФИЦИАЛЬНЫЕ КРИТЕРИИ`. Не используйте пересказ в production.

## Запуск backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# заполнить OPENAI_API_KEY
uvicorn app.main:app --reload --port 8000
```

## Запуск frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

Откройте http://localhost:3000
