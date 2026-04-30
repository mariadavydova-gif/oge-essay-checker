"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { supabase } from "../../lib/supabase"

type Check = {
  id: string
  essay_text: string
  student_essay: string | null
  selected_topic: string | null
  total_score: number
  created_at: string
}

export default function History() {
  const [checks, setChecks] = useState<Check[]>([])
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

    const { data: userData } = await supabase.auth.getUser()

    if (!userData.user) {
      setError("Вы не авторизованы")
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from("essay_checks")
      .select("*")
      .eq("user_id", userData.user.id)
      .order("created_at", { ascending: false })

    if (error) {
      setError(error.message)
    } else {
      setChecks(data || [])
    }

    setLoading(false)
  }

  if (checkingAuth || loading) {
    return <p style={{ padding: 40 }}>Загрузка...</p>
  }

  return (
    <div style={{ padding: 40 }}>
      <h1>История проверок</h1>

      {error && <p style={{ color: "red" }}>{error}</p>}

      {!checks.length && <p>Пока нет проверок</p>}

      {checks.map((c) => (
        <div
          key={c.id}
          style={{
            border: "1px solid #ddd",
            padding: 16,
            marginBottom: 16,
          }}
        >
          <div>
            <b>Дата:</b> {new Date(c.created_at).toLocaleString()}
          </div>

          <div>
            <b>Баллы:</b> {c.total_score}
          </div>

          {c.selected_topic && (
            <div style={{ marginTop: 8 }}>
              <b>Тема:</b>
              <p>{c.selected_topic}</p>
            </div>
          )}

          <div style={{ marginTop: 8 }}>
            <b>Сочинение:</b>
            <p>
              {(c.student_essay || c.essay_text).slice(0, 120)}...
            </p>
          </div>

          <div style={{ marginTop: 8 }}>
            <Link href={`/history/${c.id}`}>Открыть проверку</Link>
          </div>
        </div>
      ))}

      <p style={{ marginTop: 20 }}>
        <Link href="/">← Назад</Link>
      </p>
    </div>
  )
}