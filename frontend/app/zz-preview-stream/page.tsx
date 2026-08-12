'use client'

import { useEffect, useState } from 'react'
import { ProgressRing } from '@/components/ProgressRing'
import { createGoalStreaming, type Goal, type PlanProgress } from '@/lib/api'

// Page de vérification temporaire : le parseur SSE de `streamPlanRequest`, alimenté
// par un flux découpé volontairement au milieu des événements.
const EVENTS = [
  { done: 0, total: 12, label: 'Lecture de tes sorties Strava' },
  { done: 1, total: 12, label: '1 section rédigée' },
  { done: 4, total: 12, label: '4 sections rédigées' },
  { done: 6, total: 12, label: 'Semaine 2 sur 4 rédigée' },
  { done: 10, total: 12, label: 'Découpage des séances' },
  { done: 11, total: 12, label: '12 séances repérées' },
  { done: 12, total: 12, label: 'Objectif enregistré' },
]

const GOAL = {
  id: 'abc123',
  distance_km: 10,
  distance_label: '10 km',
  weeks: 4,
  sessions_per_week: 3,
  target_time: '50 min',
  plan: '# Plan',
  created_at: new Date().toISOString(),
}

function fakeStream(): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  let raw = ''
  for (const e of EVENTS) raw += `data: ${JSON.stringify(e)}\n\n`
  raw += `data: ${JSON.stringify({ step: 'done', goal: GOAL })}\n\n`

  // Fragments de 17 octets : les événements sont coupés en plein milieu, comme
  // le fait le réseau. Le parseur doit les rassembler sans en perdre.
  const chunks: string[] = []
  for (let i = 0; i < raw.length; i += 17) chunks.push(raw.slice(i, i + 17))

  let i = 0
  return new ReadableStream({
    async pull(controller) {
      if (i >= chunks.length) {
        controller.close()
        return
      }
      await new Promise((r) => setTimeout(r, 8))
      controller.enqueue(enc.encode(chunks[i++]))
    },
  })
}

export default function Page() {
  const [progress, setProgress] = useState<PlanProgress | null>(null)
  const [seen, setSeen] = useState<PlanProgress[]>([])
  const [goal, setGoal] = useState<Goal | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    const original = window.fetch
    window.fetch = async () =>
      new Response(fakeStream(), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    createGoalStreaming(
      'faux-token',
      { distance_km: 10, weeks: 4, sessions_per_week: 3, target_time: '50 min' },
      (p) => {
        setProgress(p)
        setSeen((s) => [...s, p])
      },
    )
      .then(setGoal)
      .catch((e) => setErr(e instanceof Error ? e.message : 'erreur'))
      .finally(() => {
        window.fetch = original
      })
    return () => {
      window.fetch = original
    }
  }, [])

  return (
    <main className="p-4">
      <div className="flex items-center gap-3">
        <ProgressRing done={progress?.done ?? 0} total={progress?.total ?? 1} color="#fc4c02" />
        <p>{progress?.label ?? '—'}</p>
      </div>
      <p id="result">
        événements reçus : {seen.length} / {EVENTS.length} · objectif : {goal ? goal.id : '—'} ·
        erreur : {err || 'aucune'}
      </p>
      <ol id="events">
        {seen.map((p, i) => (
          <li key={i}>
            {p.done}/{p.total} — {p.label}
          </li>
        ))}
      </ol>
    </main>
  )
}
