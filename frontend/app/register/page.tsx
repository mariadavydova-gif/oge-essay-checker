"use client"

import { useState } from "react"
import Link from "next/link"
import { supabase } from "../../lib/supabase"

export default function Register() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [message, setMessage] = useState("")

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()

    const { error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) {
      setMessage(error.message)
    } else {
      setMessage(
        "Если аккаунт новый — мы отправили письмо для подтверждения. Если аккаунт уже существует — войдите или восстановите пароль."
      )
    }
  }

  return (
    <div style={{ padding: 40 }}>
      <h1>Регистрация</h1>

      <form onSubmit={handleRegister}>
        <input
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <br />

        <input
          type="password"
          placeholder="Пароль"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <br />

        <button type="submit">Зарегистрироваться</button>
      </form>

      <p>{message}</p>

      <p>
        Уже есть аккаунт? <Link href="/login">Войти</Link>
      </p>

      <p>
        Не помните пароль? <Link href="/reset-password">Восстановить пароль</Link>
      </p>
    </div>
  )
}
