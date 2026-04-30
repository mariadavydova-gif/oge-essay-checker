"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { supabase } from "../../../lib/supabase"

type Check = {
  id: string
  essay_text: string
  source_text: string | null
  selected_topic: string | null
  student_essay: string | null
  result_json: any
  total_score: number
  created_at: string
}

export default function HistoryDetail() {
  const params = useParams()
  const id = params.id as string

  const [check, setCheck] = useState<Check | null>(null)
  const [loading, setLoading] = useState(true)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    checkAuthAndLoad()
  }, [])

  async function checkAuthAndLoad() {
    setCheckingAuth(true)

    const { data } = await supabase.auth.getSession()

    if (!data.session) {
      window.location.href = "/login"
      return
    }

    setCheckingAuth(false)
    await load()
  }

  async function load() {
    setLoading(true)
    setError("")

    const { data, error } = await supabase
      .from("essay_checks")
      .select("*")
      .eq("id", id)
      .single()

    if (error) {
      setError(error.message)
    } else {
      setCheck(data)
    }

    setLoading(false)
  }

  if (checkingAuth || loading) {
    return <p style={{ padding: 40 }}>Загрузка...</p>
  }

  if (error) {
    return (
      <div style={{ padding: 40 }}>
        <p style={{ color: "red" }}>{error}</p>
        <Link href="/history">← Назад</Link>
      </div>
    )
  }

  if (!check) return null

  const result = check.result_json
  const studentEssay = check.student_essay || check.essay_text

  return (
    <div style={{ padding: 40 }}>
      <h1>Проверка от {new Date(check.created_at).toLocaleString()}</h1>

      <p>
        <b>Итог:</b> {check.total_score}
      </p>

      {check.selected_topic && (
        <>
          <h2>Тема</h2>
          <p>{check.selected_topic}</p>
        </>
      )}

      {check.source_text && (
        <>
          <h2>Исходный текст</h2>
          <p style={{ whiteSpace: "pre-wrap" }}>{check.source_text}</p>
        </>
      )}

      <h2>Сочинение ученика</h2>
      <p style={{ whiteSpace: "pre-wrap" }}>{studentEssay}</p>

      <h2>Баллы</h2>
      <table>
        <tbody>
          {Object.entries(result.scores || {}).map(([key, value]) => (
            <tr key={key}>
              <td>{key}</td>
              <td>{String(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Разбор</h2>
      {Object.entries(result.analysis || {}).map(([key, value]) => (
        <div key={key}>
          <b>{key}</b>
          <p>{String(value)}</p>
        </div>
      ))}

      <h2>Ошибки</h2>
      {Object.entries(result.errors || {}).map(([key, value]) => (
        <div key={key}>
          <b>{key}</b>
          {Array.isArray(value) && value.length > 0 ? (
            <ul>
              {value.map((item: string, index: number) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          ) : (
            <p>Не найдено</p>
          )}
        </div>
      ))}

      <h2>Рекомендации</h2>
      <ol>
        {(result.recommendations || []).map((r: string, i: number) => (
          <li key={i}>{r}</li>
        ))}
      </ol>

      <button
        type="button"
        onClick={() => {
          localStorage.setItem("rewriteEssay", studentEssay)
          window.location.href = "/"
        }}
      >
        Переписать сочинение
      </button>

      <p style={{ marginTop: 20 }}>
        <Link href="/history">← Назад к истории</Link>
      </p>
    </div>
  )
}