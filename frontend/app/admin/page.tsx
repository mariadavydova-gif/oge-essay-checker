"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { supabase } from "../../lib/supabase"

type Check = {
  id: string
  user_id: string
  selected_topic: string | null
  student_essay: string | null
  essay_text: string
  total_score: number
  created_at: string
}

export default function AdminPage() {
  const [checks, setChecks] = useState<Check[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const { data: userData } = await supabase.auth.getUser()

    if (!userData.user) {
      window.location.href = "/login"
      return
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single()

    if (profile?.role !== "admin") {
      setError("Доступ запрещён")
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from("essay_checks")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) {
      setError(error.message)
    } else {
      setChecks(data || [])
    }

    setLoading(false)
  }

  if (loading) return <p style={{ padding: 40 }}>Загрузка...</p>

  return (
    <div style={{ padding: 40 }}>
      <h1>Админка</h1>

      <p>
        <Link href="/">← На главную</Link>
      </p>

      {error && <p style={{ color: "red" }}>{error}</p>}

      {!error && (
        <>
          <p>Всего проверок: {checks.length}</p>

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
                <b>User ID:</b> {c.user_id}
              </div>

              <div>
                <b>Баллы:</b> {c.total_score}
              </div>

              {c.selected_topic && (
                <div>
                  <b>Тема:</b> {c.selected_topic}
                </div>
              )}

              <div style={{ marginTop: 8 }}>
                <b>Сочинение:</b>
                <p>{(c.student_essay || c.essay_text).slice(0, 200)}...</p>
              </div>

              <Link href={`/history/${c.id}`}>Открыть проверку</Link>
            </div>
          ))}
        </>
      )}
    </div>
  )
}