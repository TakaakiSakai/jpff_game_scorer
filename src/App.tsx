/* eslint-disable @typescript-eslint/no-explicit-any */
// App.tsx — Single Page: Play editor + list + scoreboard + CSV (no sign-in, no backend)
// すべてローカル保存(localStorage)。ブラウザを閉じても復元されます。

import React, { useEffect, useMemo, useState } from 'react'
import '@aws-amplify/ui-react/styles.css' // ベースのCSSだけ拝借(Authenticatorは不使用)

// ===== Local storage =====
const LS_KEY = 'jpff:localGame:v1'
type Play = {
  id: string
  createdAt: string
  q: '1Q'|'2Q'|'3Q'|'4Q'|'OT'
  time: string
  attackTeam: 'home'|'visitor'|'-'
  fieldPos: 'H'|'V'|'-'
  ballOn: number | null
  down: 1|2|3|4
  toGo: number | null
  playType: string
  gainYds: number | null
  fd: boolean
  sack: boolean
  passerNo?: number | null
  runnerNo?: number | null
  kickerNo?: number | null
  tacklerNo?: number | null
  tacklerNo2?: number | null
  interceptorNo?: number | null
  turnover?: '-'|'Intercept'|'Fumble'|'4th down失敗'|'Safety'
  penaltyY?: number | null
  remarks?: string
  scoreTeam?: '-'|'home'|'visitor'
  scoreMethod?: '-'|'TD'|'FG'|'Safety'|'TFP(Kick)'|'TFP(Run)'|'TFP(Pass)'
}
type SaveData = {
  date: string
  venue: string
  home: string
  visitor: string
  plays: Play[]
}

const load = (): SaveData => {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '') as SaveData } catch { /* ignore */ }
  // 初期値
  return {
    date: new Date().toISOString().slice(0,10),
    venue: '',
    home: '',
    visitor: '',
    plays: []
  }
}
const save = (data: SaveData) => localStorage.setItem(LS_KEY, JSON.stringify(data))

// ===== Utils =====
const uuid = () => Math.random().toString(36).slice(2) + Date.now().toString(36)
const scorePoints = (method?: string) => {
  switch (method) {
    case 'TD': return 6
    case 'FG': return 3
    case 'Safety': return 2
    case 'TFP(Kick)': return 1
    case 'TFP(Run)':
    case 'TFP(Pass)': return 2
    default: return 0
  }
}

// ===== App =====
export default function App() {
  // 試合ヘッダ（ここでチーム名や会場は編集。別画面はありません）
  const [state, setState] = useState<SaveData>(() => load())
  const set = <K extends keyof SaveData>(k: K, v: SaveData[K]) => setState(s => ({ ...s, [k]: v }))

  // 編集中プレー
  const [p, setP] = useState<Play>(blankPlay())
  const [editingId, setEditingId] = useState<string | null>(null)

  // 永続化
  useEffect(() => { save(state) }, [state])

  // スコアボード
  const board = useMemo(() => {
    const blank = { Q1:0, Q2:0, Q3:0, Q4:0, Total:0 }
    const H = { ...blank }, V = { ...blank }
    state.plays.forEach(row => {
      const pt = scorePoints(row.scoreMethod)
      if (!pt || row.scoreTeam === '-' || !row.scoreTeam) return
      const tgt = row.scoreTeam === 'home' ? H : V
      const key = ({'1Q':'Q1','2Q':'Q2','3Q':'Q3','4Q':'Q4'} as any)[row.q] || 'Q1'
      ;(tgt as any)[key] += pt
      tgt.Total += pt
    })
    return { H, V }
  }, [state.plays])

  // 追加/更新/削除
  const addOrUpdate = () => {
    if (!state.home || !state.visitor) { alert('ホーム/ビジター名を入力してください'); return }
    const base = { ...p, id: editingId ?? uuid(), createdAt: p.createdAt ?? new Date().toISOString() }
    setState(s => {
      const plays = editingId
        ? s.plays.map(x => x.id === editingId ? base : x)
        : [...s.plays, base]
      return { ...s, plays }
    })
    setP(blankPlay()); setEditingId(null)
  }
  const edit = (row: Play) => { setP({...row}); setEditingId(row.id) }
  const remove = (id: string) => {
    if (!confirm('この行を削除しますか？')) return
    setState(s => ({ ...s, plays: s.plays.filter(x => x.id !== id) }))
    if (editingId === id) { setP(blankPlay()); setEditingId(null) }
  }
  const resetAll = () => {
    if (!confirm('現在の内容をすべてリセット
