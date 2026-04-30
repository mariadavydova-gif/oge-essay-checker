'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { essayTaskSets, type EssayTaskType, type EssayTaskSet } from '../lib/essayTasks';
import { supabase } from '../lib/supabase';

type Result = {
  task_type: '13.1' | '13.2' | '13.3';
  word_count: number;
  evaluation_status: string;
  official_content_score: number;
  official_language_score_mode: string;
  scores: Record<string, number>;
  errors: Record<string, string[]>;
  analysis: Record<string, string>;
  recommendations: string[];
  annotated_text: { fragment: string; issue: string; comment: string }[];
};

const criteria = ['СК1', 'СК2', 'СК3', 'СК4', 'ГК1', 'ГК2', 'ГК3', 'ГК4', 'ФК1'];

const errorTitles: Record<string, string> = {
  orthography: 'Орфография',
  punctuation: 'Пунктуация',
  grammar: 'Грамматика',
  speech: 'Речь',
  logic: 'Логика',
  facts: 'Факты',
};

function highlightText(text: string, annotations: Result['annotated_text']) {
  let parts: ReactNode[] = [text];

  annotations.slice(0, 20).forEach((a, i) => {
    const nextParts: ReactNode[] = [];

    parts.forEach((part) => {
      if (typeof part !== 'string' || !a.fragment) {
        nextParts.push(part);
        return;
      }

      const idx = part.indexOf(a.fragment);

      if (idx === -1) {
        nextParts.push(part);
        return;
      }

      nextParts.push(
        part.slice(0, idx),
        <mark key={`${a.fragment}-${i}`} title={`${a.issue}: ${a.comment}`}>
          {a.fragment}
        </mark>,
        part.slice(idx + a.fragment.length)
      );
    });

    parts = nextParts;
  });

  return parts;
}

export default function Page() {
  const [essay, setEssay] = useState('');
  const [taskType, setTaskType] = useState<'auto' | EssayTaskType>('auto');
  const [mode, setMode] = useState('diagnostic');
  const [workMode, setWorkMode] = useState<'topic' | 'ready'>('ready');
  const [topicFilter, setTopicFilter] = useState<'auto' | EssayTaskType>('auto');
  const [selectedTaskSet, setSelectedTaskSet] = useState<EssayTaskSet | null>(null);
  const [selectedTopic, setSelectedTopic] = useState('');

  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    async function init() {
      const { data } = await supabase.auth.getSession();

      if (!data.session) {
        window.location.href = '/login';
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      setUserEmail(userData.user?.email || '');

      const savedEssay = localStorage.getItem('rewriteEssay');

      if (savedEssay) {
        setEssay(savedEssay);
        localStorage.removeItem('rewriteEssay');
      }

      setCheckingAuth(false);
    }

    init();
  }, []);

  const total = useMemo(
    () => (result ? Object.values(result.scores).reduce((a, b) => a + b, 0) : 0),
    [result]
  );

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  function generateTask() {
    const randomSet = essayTaskSets[Math.floor(Math.random() * essayTaskSets.length)];

    const types: EssayTaskType[] =
      topicFilter === 'auto' ? ['13.1', '13.2', '13.3'] : [topicFilter];

    const randomType = types[Math.floor(Math.random() * types.length)];
    const topic = randomSet.tasks[randomType];

    setSelectedTaskSet(randomSet);
    setTaskType(randomType);
    setSelectedTopic(`${randomType}: ${topic}`);
    setEssay('');
    setResult(null);
    setError('');
  }

  async function check() {
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        throw new Error('Сначала войдите в аккаунт');
      }

      const essayTextForCheck =
        selectedTaskSet && selectedTopic
          ? `ИСХОДНЫЙ ТЕКСТ:
${selectedTaskSet.sourceText}

ТЕМА СОЧИНЕНИЯ:
${selectedTopic}

СОЧИНЕНИЕ УЧЕНИКА:
${essay}`
          : essay;

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/check-essay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          essay_text: essayTextForCheck,
          task_type: taskType,
          mode,
          source_text: selectedTaskSet?.sourceText || null,
          selected_topic: selectedTopic || null,
          student_essay: essay,
        }),
      });

      if (!res.ok) throw new Error(await res.text());

      setResult(await res.json());
    } catch (e: any) {
      setError(e.message || 'Ошибка проверки');
    } finally {
      setLoading(false);
    }
  }

  if (checkingAuth) {
    return <main className="shell">Загрузка...</main>;
  }

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">ОГЭ русский язык · задание 13</p>
          <h1>Проверка сочинения за 1 клик</h1>
          <p className="muted">
            Получите случайную тему с исходным текстом или вставьте готовое сочинение.
          </p>

          <p className="muted">{userEmail}</p>

          <div className="toolbar">
            <Link href="/history">История</Link>
            <button type="button" onClick={logout}>
              Выйти
            </button>
          </div>
        </div>
      </section>

      <section className="card inputCard">
        <div className="toolbar">
          <button
            onClick={() => {
              setWorkMode('topic');
              setResult(null);
              setError('');
            }}
            type="button"
          >
            Получить тему
          </button>

          <button
            onClick={() => {
              setWorkMode('ready');
              setSelectedTaskSet(null);
              setSelectedTopic('');
              setTaskType('auto');
              setResult(null);
              setError('');
            }}
            type="button"
          >
            Проверить готовое сочинение
          </button>
        </div>

        {workMode === 'topic' && (
          <div style={{ marginBottom: 20 }}>
            <div className="toolbar">
              <select
                value={topicFilter}
                onChange={(e) => setTopicFilter(e.target.value as 'auto' | EssayTaskType)}
              >
                <option value="auto">Любой тип задания</option>
                <option value="13.1">Только 13.1</option>
                <option value="13.2">Только 13.2</option>
                <option value="13.3">Только 13.3</option>
              </select>

              <button onClick={generateTask} type="button">
                Случайная тема
              </button>
            </div>

            {selectedTaskSet && selectedTopic && (
              <div className="card" style={{ marginTop: 16 }}>
                <p className="eyebrow">{selectedTaskSet.title}</p>

                <h2>Исходный текст</h2>
                <p style={{ whiteSpace: 'pre-wrap' }}>{selectedTaskSet.sourceText}</p>

                <h2>Тема</h2>
                <p>
                  <b>{selectedTopic}</b>
                </p>
              </div>
            )}
          </div>
        )}

        {workMode === 'ready' && (
          <div className="toolbar">
            <select value={taskType} onChange={(e) => setTaskType(e.target.value as 'auto' | EssayTaskType)}>
              <option value="auto">Автоопределение</option>
              <option value="13.1">13.1</option>
              <option value="13.2">13.2</option>
              <option value="13.3">13.3</option>
            </select>

            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="diagnostic">diagnostic</option>
              <option value="strict_official">strict_official</option>
            </select>
          </div>
        )}

        {workMode === 'topic' && (
          <div className="toolbar">
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="diagnostic">diagnostic</option>
              <option value="strict_official">strict_official</option>
            </select>
          </div>
        )}

        <textarea
          value={essay}
          onChange={(e) => setEssay(e.target.value)}
          placeholder={
            workMode === 'topic'
              ? 'Напишите сочинение по выбранной теме...'
              : 'Вставьте готовое сочинение...'
          }
        />

        <button onClick={check} disabled={loading || essay.trim().length < 20} type="button">
          {loading ? 'Проверяем...' : 'Проверить'}
        </button>

        {error && <p className="error">{error}</p>}
      </section>

      {result && (
        <section className="results">
          <div className="card grid3">
            <div>
              <span>Итог</span>
              <strong>{total}</strong>
            </div>
            <div>
              <span>Статус</span>
              <strong>{result.evaluation_status}</strong>
            </div>
            <div>
              <span>Слов</span>
              <strong>{result.word_count}</strong>
            </div>
          </div>

          <div className="card">
            <h2>Баллы по критериям</h2>
            <table>
              <tbody>
                {criteria.map((c) => (
                  <tr key={c}>
                    <td>{c}</td>
                    <td>{result.scores[c] ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h2>Разбор</h2>
            {criteria.map((c) => (
              <div className="analysis" key={c}>
                <b>{c}</b>
                <p>{result.analysis[c] || 'Нет комментария'}</p>
              </div>
            ))}
          </div>

          <div className="card">
            <h2>Ошибки</h2>
            {Object.entries(result.errors).map(([k, v]) => (
              <div key={k}>
                <b>{errorTitles[k] || k}</b>
                {v.length ? (
                  <ul>
                    {v.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">Не найдено</p>
                )}
              </div>
            ))}
          </div>

          <div className="card">
            <h2>Рекомендации</h2>
            <ol>
              {result.recommendations.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ol>
          </div>

          <div className="card">
            <h2>Подсветка текста</h2>
            <p className="essayText">{highlightText(essay, result.annotated_text)}</p>
          </div>
        </section>
      )}
    </main>
  );
}