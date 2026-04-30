"use client"

import { useState } from "react"
import Link from "next/link"
import { supabase } from "../../lib/supabase"

export default function ResetPassword() {
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState("")

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage("")

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "http://localhost:3000/update-password",
    })

    if (error) {
      setMessage(error.message)
    } else {
      setMessage("Если такой email зарегистрирован, мы отправили письмо для восстановления пароля.")
    }
  }

  return (
    <div style={{ padding: 40 }}>
      <h1>Восстановление пароля</h1>

      <form onSubmit={handleReset}>
        <input
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <br />

        <button type="submit">Восстановить пароль</button>
      </form>

      <p>{message}</p>

      <p>
        Вспомнили пароль? <Link href="/login">Войти</Link>
      </p>
    </div>
  )
}