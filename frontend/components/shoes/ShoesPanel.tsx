'use client'

import { useCallback, useEffect, useState } from 'react'
import { deleteShoe, listShoes, patchShoe, type Shoe } from '@/lib/api'
import { getToken } from '@/lib/auth'
import { ProgressRing } from '@/components/ProgressRing'
import { AddShoeModal } from '@/components/shoes/AddShoeModal'
import { ModalClose, ShoeIcon, ShoeModal } from '@/components/shoes/ShoeModal'
import {
  CATEGORY_LABELS,
  SHOES_CHANGED_EVENT,
  WEAR_STATUS,
  formatDay,
  formatMonth,
  formatShoeKm,
  formatWeeksLeft,
  notifyShoesChanged,
  shoeTitle,
  todayDay,
} from '@/lib/shoes'

/** Projection en une phrase : quand changer la paire, au rythme où elle roule. */
function projection(s: Shoe): string {
  const w = s.wear
  if (w.status === 'worn') return `Durée de vie dépassée de ${formatShoeKm(w.used_km - w.lifespan_km)}.`
  if (!w.km_per_week || w.weeks_left == null || !w.replace_on) {
    return 'La projection apparaîtra après tes premières sorties avec cette paire.'
  }
  return `À ${formatShoeKm(w.km_per_week)} par semaine, encore ${formatWeeksLeft(w.weeks_left)} — vers ${formatMonth(
    w.replace_on,
  )}.`
}

function ShoeCard({
  shoe,
  onEdit,
  onToggleRetired,
  onDelete,
}: {
  shoe: Shoe
  onEdit: () => void
  onToggleRetired: () => void
  onDelete: () => void
}) {
  const st = WEAR_STATUS[shoe.wear.status]
  const pct = Math.min(shoe.wear.wear_pct, 100)
  return (
    <li className={`app-card p-4 sm:p-5 ${shoe.retired ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-4">
        <ProgressRing
          done={shoe.wear.used_km}
          total={shoe.wear.lifespan_km}
          size={64}
          stroke={5}
          color={st.color}
          label={`Usure : ${Math.round(shoe.wear.wear_pct)} %`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`badge ${st.badge}`}>{st.label}</span>
            <span className="badge">{CATEGORY_LABELS[shoe.category]}</span>
            {shoe.retired ? <span className="badge">Au placard</span> : null}
          </div>
          <h3 className="mt-2 truncate font-display text-[17px] font-semibold leading-6 text-white">
            {shoeTitle(shoe)}
          </h3>
          {shoe.nickname ? <p className="truncate text-[13px] text-white/50">« {shoe.nickname} »</p> : null}
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-display text-[22px] font-semibold tabular-nums text-white">
            {formatShoeKm(shoe.wear.used_km)}
            <span className="ml-1 text-[13px] font-medium text-white/40">/ {formatShoeKm(shoe.wear.lifespan_km)}</span>
          </p>
          <p className="text-[13px] tabular-nums text-white/60">
            {shoe.wear.status === 'worn' ? 'Usées' : `Reste ${formatShoeKm(shoe.wear.remaining_km)}`}
          </p>
        </div>
        <div className="meter mt-2">
          <div className="meter-fill" style={{ width: `${pct}%`, backgroundImage: 'none', backgroundColor: st.color }} />
        </div>
        <p className="mt-3 text-[13px] leading-5 text-white/70">{projection(shoe)}</p>
        <p className="mt-1 text-[12px] leading-[18px] text-white/40">{st.hint}</p>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
        <p className="text-[12px] text-white/40">
          Depuis le {formatDay(shoe.started_on)} · {shoe.runs} course{shoe.runs > 1 ? 's' : ''} NeuroRun
        </p>
        <div className="flex gap-1.5">
          <button type="button" className="rounded-lg px-2.5 py-1.5 text-[12.5px] text-white/65 hover:bg-white/[0.05] hover:text-white" onClick={onEdit}>
            Corriger
          </button>
          <button type="button" className="rounded-lg px-2.5 py-1.5 text-[12.5px] text-white/65 hover:bg-white/[0.05] hover:text-white" onClick={onToggleRetired}>
            {shoe.retired ? 'Ressortir' : 'Mettre au placard'}
          </button>
          <button type="button" className="rounded-lg px-2.5 py-1.5 text-[12.5px] text-red-300/80 hover:bg-red-500/10 hover:text-red-200" onClick={onDelete}>
            Supprimer
          </button>
        </div>
      </div>
    </li>
  )
}

function EditShoeModal({ shoe, onClose, onSaved }: { shoe: Shoe; onClose: () => void; onSaved: (s: Shoe) => void }) {
  const [initialKm, setInitialKm] = useState(String(shoe.initial_km).replace('.', ','))
  const [lifespan, setLifespan] = useState(String(shoe.lifespan_km))
  const [startedOn, setStartedOn] = useState(shoe.started_on)
  const [nickname, setNickname] = useState(shoe.nickname ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    const token = getToken()
    if (!token) return
    const km = Number(initialKm.replace(',', '.'))
    const life = Number(lifespan.replace(',', '.'))
    if (!Number.isFinite(km) || km < 0 || !Number.isFinite(life)) {
      setError('Valeurs invalides.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      onSaved(
        await patchShoe(token, shoe.id, {
          initial_km: km,
          lifespan_km: life,
          started_on: startedOn,
          nickname: nickname.trim(),
        }),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enregistrement impossible.')
      setSaving(false)
    }
  }

  return (
    <ShoeModal onClose={onClose} labelledBy="edit-shoe-title">
      <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] px-5 pb-4 pt-5">
        <div className="min-w-0">
          <p className="app-kicker">Corriger</p>
          <h2 id="edit-shoe-title" className="mt-1 truncate font-display text-lg font-semibold text-white">
            {shoeTitle(shoe)}
          </h2>
        </div>
        <ModalClose onClick={onClose} />
      </div>
      <div className="space-y-4 px-5 py-5">
        <label className="block">
          <span className="mb-1.5 block text-[12px] font-medium text-white/55">Kilomètres faits avant NeuroRun</span>
          <input inputMode="decimal" className="field" value={initialKm} onChange={(e) => setInitialKm(e.target.value)} />
          <span className="mt-1.5 block text-[12px] text-white/40">
            S’ajoutent aux {shoe.runs} course{shoe.runs > 1 ? 's' : ''} NeuroRun rattachée{shoe.runs > 1 ? 's' : ''} à la paire.
          </span>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium text-white/55">Durée de vie théorique (km)</span>
            <input inputMode="numeric" className="field" value={lifespan} onChange={(e) => setLifespan(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium text-white/55">Depuis le</span>
            <input
              type="date"
              className="field [color-scheme:dark]"
              value={startedOn}
              max={todayDay()}
              onChange={(e) => setStartedOn(e.target.value)}
            />
          </label>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-[12px] font-medium text-white/55">Surnom</span>
          <input className="field" value={nickname} maxLength={40} onChange={(e) => setNickname(e.target.value)} />
        </label>
        {error ? <p className="text-sm text-red-300">{error}</p> : null}
        <div className="flex gap-2">
          <button type="button" className="btn-quiet flex-1" onClick={onClose}>
            Annuler
          </button>
          <button type="button" className="btn-brand flex-1" disabled={saving} onClick={save}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </ShoeModal>
  )
}

/** Écran Chaussures : paires actives, usure théorique et projection de remplacement. */
export function ShoesPanel() {
  const [shoes, setShoes] = useState<Shoe[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Shoe | null>(null)
  const [showRetired, setShowRetired] = useState(false)

  const load = useCallback(async () => {
    const token = getToken()
    if (!token) return
    try {
      setShoes(await listShoes(token))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chargement impossible.')
    }
  }, [])

  useEffect(() => {
    void load()
    const onChange = () => void load()
    window.addEventListener(SHOES_CHANGED_EVENT, onChange)
    return () => window.removeEventListener(SHOES_CHANGED_EVENT, onChange)
  }, [load])

  async function toggleRetired(s: Shoe) {
    const token = getToken()
    if (!token) return
    try {
      await patchShoe(token, s.id, { retired: !s.retired })
      notifyShoesChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action impossible.')
    }
  }

  async function remove(s: Shoe) {
    if (!window.confirm(`Supprimer ${shoeTitle(s)} ? Ses courses resteront, sans paire.`)) return
    const token = getToken()
    if (!token) return
    try {
      await deleteShoe(token, s.id)
      notifyShoesChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Suppression impossible.')
    }
  }

  const active = (shoes ?? []).filter((s) => !s.retired)
  const retired = (shoes ?? []).filter((s) => s.retired)

  return (
    <div className="space-y-6">
      <section className="app-hero p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="app-kicker">Usure théorique</p>
            <p className="mt-2 max-w-md text-[14px] leading-[21px] text-white/75">
              Chaque paire a une durée de vie en kilomètres. NeuroRun compte ceux que tu fais avec et te dit quand la
              changer. Avec plusieurs paires, on te demande laquelle tu portais à la fin de chaque course.
            </p>
          </div>
          <button type="button" className="btn-brand" onClick={() => setAdding(true)}>
            <ShoeIcon className="h-5 w-5" />
            Ajouter une paire
          </button>
        </div>
      </section>

      {error ? (
        <div className="toast toast--error" role="alert">
          {error}
        </div>
      ) : null}

      {shoes == null && !error ? (
        <div className="space-y-3">
          <div className="app-skeleton h-[220px] rounded-[20px]" />
          <div className="app-skeleton h-[220px] rounded-[20px]" />
        </div>
      ) : null}

      {shoes != null && active.length === 0 ? (
        <div className="app-empty">
          <ShoeIcon className="mx-auto h-8 w-8 text-white/35" />
          <p className="mt-3 font-display text-[16px] font-semibold text-white">Aucune paire suivie</p>
          <p className="mx-auto mt-1 max-w-sm text-[13px] leading-5 text-white/50">
            Ajoute ta paire actuelle : on estime les kilomètres déjà faits depuis ton historique.
          </p>
        </div>
      ) : null}

      {active.length > 0 ? (
        <ul className="grid gap-4 lg:grid-cols-2">
          {active.map((s) => (
            <ShoeCard
              key={s.id}
              shoe={s}
              onEdit={() => setEditing(s)}
              onToggleRetired={() => void toggleRetired(s)}
              onDelete={() => void remove(s)}
            />
          ))}
        </ul>
      ) : null}

      {retired.length > 0 ? (
        <section>
          <button
            type="button"
            className="text-[13px] font-medium text-white/55 hover:text-white/85"
            aria-expanded={showRetired}
            onClick={() => setShowRetired((v) => !v)}
          >
            {showRetired ? 'Masquer' : 'Voir'} les paires au placard ({retired.length})
          </button>
          {showRetired ? (
            <ul className="mt-3 grid gap-4 lg:grid-cols-2">
              {retired.map((s) => (
                <ShoeCard
                  key={s.id}
                  shoe={s}
                  onEdit={() => setEditing(s)}
                  onToggleRetired={() => void toggleRetired(s)}
                  onDelete={() => void remove(s)}
                />
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <p className="app-note">
        Durées de vie indicatives (catalogue NeuroRun, d’après les fourchettes des fabricants) : ton poids, ta foulée et le
        terrain les font varier. Corrige-les si tu sens l’amorti partir plus tôt.
      </p>

      {adding ? (
        <AddShoeModal
          hasOtherShoes={active.length > 0}
          onClose={() => setAdding(false)}
          onCreated={() => {
            setAdding(false)
            notifyShoesChanged()
          }}
        />
      ) : null}
      {editing ? (
        <EditShoeModal
          shoe={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            notifyShoesChanged()
          }}
        />
      ) : null}
    </div>
  )
}
