/* eslint-disable @typescript-eslint/no-explicit-any */
// App.tsx（完成版）

import React, { useEffect, useMemo, useState } from 'react'
import { Link, Routes, Route, BrowserRouter, useNavigate, useParams } from 'react-router-dom'
import { Authenticator, TextField } from '@aws-amplify/ui-react'
import '@aws-amplify/ui-react/styles.css'
import { generateClient } from 'aws-amplify/api'
import { getCurrentUser } from 'aws-amplify/auth'

// =============== Amplify client ===============
const client = generateClient()

// =============== GraphQL ===============

// --- Game 取得 / 作成（名前方式）
const GET_GAME = /* GraphQL */ `
  query GetGame($id: ID!) {
    getGame(id: $id) { id date venue home visitor homeTeamID awayTeamID status editToken }
  }
`

const CREATE_GAME = /* GraphQL */ `
  mutation CreateGame($input: CreateGameInput!) {
    createGame(input: $input) { id date venue home visitor homeTeamID awayTeamID status editToken }
  }
`

const UPDATE_GAME = /* GraphQL */ `
  mutation UpdateGame($input: UpdateGameInput!) {
    updateGame(input: $input) { id date venue home visitor homeTeamID awayTeamID status editToken }
  }
`

// --- listPlaysByGame が無い場合に備えてフォールバックも用意
const LIST_PLAYS_BY_GAME = /* GraphQL */ `
  query ListPlaysByGame($gameId: ID!, $sortDirection: ModelSortDirection) {
    listPlaysByGame(gameId: $gameId, sortDirection: $sortDirection) {
      items {
        id gameId createdAt
        q time attackTeam fieldPos ballOn toGo down gainYds
        playType fd sack
        passerNo runnerNo kickerNo
        tacklerNo tacklerNo2 interceptorNo
        turnover penaltyY remarks
        scoreTeam scoreMethod
      }
      nextToken
    }
  }
`

const LIST_PLAYS_FALLBACK = /* GraphQL */ `
  query ListPlays($filter: ModelPlayFilterInput, $limit: Int) {
    listPlays(filter: $filter, limit: $limit) {
      items {
        id gameId createdAt
        q time attackTeam fieldPos ballOn toGo down gainYds
        playType fd sack
        passerNo runnerNo kickerNo
        tacklerNo tacklerNo2 interceptorNo
        turnover penaltyY remarks
        scoreTeam scoreMethod
      }
      nextToken
    }
  }
`

const CREATE_PLAY = /* GraphQL */ `
  mutation CreatePlay($input: CreatePlayInput!) {
    createPlay(input: $input) {
      id gameId createdAt
      q time attackTeam fieldPos ballOn toGo down gainYds
      playType fd sack
      passerNo runnerNo kickerNo
      tacklerNo tacklerNo2 interceptorNo
      turnover penaltyY remarks
      scoreTeam scoreMethod
    }
  }
`

const UPDATE_PLAY = /* GraphQL */ `
  mutation UpdatePlay($input: UpdatePlayInput!) {
    updatePlay(input: $input) {
      id gameId createdAt
      q time attackTeam fieldPos ballOn toGo down gainYds
      playType fd sack
      passerNo runnerNo kickerNo
      tacklerNo tacklerNo2 interceptorNo
      turnover penaltyY remarks
      scoreTeam scoreMethod
    }
  }
`

const DELETE_PLAY = /* GraphQL */ `
  mutation DeletePlay($input: DeletePlayInput!) {
    deletePlay(input: $input) { id }
  }
`

const ON_CREATE_PLAY = /* GraphQL */ `
  subscription OnCreatePlay {
    onCreatePlay {
      id gameId createdAt
      q time attackTeam fieldPos ballOn toGo down gainYds
      playType fd sack
      passerNo runnerNo kickerNo
      tacklerNo tacklerNo2 interceptorNo
      turnover penaltyY remarks
      scoreTeam scoreMethod
    }
  }
`

const ON_UPDATE_PLAY = /* GraphQL */ `
  subscription OnUpdatePlay {
    onUpdatePlay {
      id gameId createdAt
      q time attackTeam fieldPos ballOn toGo down gainYds
      playType fd sack
      passerNo runnerNo kickerNo
      tacklerNo tacklerNo2 interceptorNo
      turnover penaltyY remarks
      scoreTeam scoreMethod
    }
  }
`

// --- 追加: チームID方式でのGame作成 + Team検索/作成
const CREATE_GAME_BY_TEAMID = /* GraphQL */ `
  mutation CreateGame($input: CreateGameInput!) {
    createGame(input: $input) { id date venue homeTeamID awayTeamID status editToken }
  }
`

const LIST_TEAMS_BY_NAME = /* GraphQL */ `
  query ListTeams($name: String!) {
    listTeams(filter: { name: { eq: $name } }, limit: 1) {
      items { id name }
    }
  }
`

const CREATE_TEAM = /* GraphQL */ `
  mutation CreateTeam($input: CreateTeamInput!) {
    createTeam(input: $input) { id name }
  }
`

// =============== helpers ===============
const isNum = (v: any) => v !== null && v !== undefined && v !== '' && !isNaN(Number(v))
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
const to2 = (n: number) => (n < 10 ? `0${n}` : `${n}`)

// 名前から Team の id を取得（なければ作成）
async function getOrCreateTeamId(name: string): Promise<string> {
  if (!name) throw new Error('team name required')
  // 既存検索
  try {
    const r: any = await client.graphql({
      query: LIST_TEAMS_BY_NAME,
      variables: { name },
      authMode: 'userPool',
    })
    const hit = r?.data?.listTeams?.items?.[0]
    if (hit?.id) return hit.id
  } catch { /* 検索失敗は作成へ */ }
  // 新規作成
  const c: any = await client.graphql({
    query: CREATE_TEAM,
    variables: { input: { name } },
    authMode: 'userPool',
  })
  const id = c?.data?.createTeam?.id
  if (!id) throw new Error('createTeam failed')
  return id
}

// =============== Root ===============
export default function App() {
  return (
    <>
      <GlobalStyle />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="/game/:id" element={<Game />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </>
  )
}

// =============== Home（トップ：サインイン/サインアップ） ===============
function Home() {
  const [signedIn, setSignedIn] = useState(false)
  const [checking, setChecking] = useState(true)
  const qs = new URLSearchParams(location.search)
  const gid = qs.get('id')

  useEffect(() => {
    (async () => {
      try { await getCurrentUser(); setSignedIn(true) } catch { setSignedIn(false) }
      finally { setChecking(false) }
    })()
  }, [])

  return (
    <div className="page">
      <Header title="【JPFF East】" subtitle="Game Scorer" />
      <div className="card">
        {!checking && !signedIn ? (
          <>
            <h2>サインイン / ユーザー作成</h2>
            <p className="muted" style={{marginTop:4}}>ログインすると試合作成・編集ができます。</p>
            <div style={{marginTop:12}}>
              <Authenticator signUpAttributes={['email']} />
            </div>
          </>
        ) : (
          <div className="stack">
            <p>試合URLを共有すると、ログイン済みユーザーは「編集」、未ログインは「参照」で閲覧できます。</p>
            <div className="row gap">
              <Link className="btn gray" to="/setup">試合を作成</Link>
              {gid && <Link className="btn" to={`/game/${gid}`}>試合へ移動</Link>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// =============== Setup（試合作成：フォールバック付き） ===============
function Setup() {
  const nav = useNavigate()
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [venue, setVenue] = useState('')
  const [home, setHome] = useState('')
  const [visitor, setVisitor] = useState('')
  const [saving, setSaving] = useState(false)
  const [signedIn, setSignedIn] = useState(false)
  const [showAuth, setShowAuth] = useState(false)

  useEffect(() => {
    (async () => { try { await getCurrentUser(); setSignedIn(true) } catch { setSignedIn(false) } })()
  }, [])

  async function createGame() {
    if (!home || !visitor) { alert('ホーム/ビジターを入力してください'); return }
    if (!signedIn) { setShowAuth(true); return }

    setSaving(true)
    try {
      // ① 名前方式で試行
      try {
        const res: any = await client.graphql({
          query: CREATE_GAME,
          variables: { input: { date, venue, home, visitor, status: 'scheduled' } },
          authMode: 'userPool',
        })
        const id = res?.data?.createGame?.id
        if (id) { nav(`/game/${id}`); return }
        throw new Error('createGame returned no id')
      } catch {
        // ② 失敗 → ID方式で再試行（必要ならTeam自動作成）
        const homeTeamID = await getOrCreateTeamId(home)
        const awayTeamID = await getOrCreateTeamId(visitor)
        const r2: any = await client.graphql({
          query: CREATE_GAME_BY_TEAMID,
          variables: { input: { date, venue, homeTeamID, awayTeamID, status: 'scheduled' } },
          authMode: 'userPool',
        })
        const id2 = r2?.data?.createGame?.id
        if (id2) { nav(`/game/${id2}`); return }
        throw new Error('createGame(by team id) returned no id')
      }
    } catch (e: any) {
      const msg = e?.errors?.[0]?.message || e?.message || '作成に失敗しました'
      alert(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page">
      <Header title="【JPFF East】" subtitle="Game Scorer" />
      <div className="card">
        <h2>試合作成（サインインが必要）</h2>

        {/* 入力は常に可能 */}
        <div className="grid2">
          <div className="block">
            <label>試合日</label>
            <input className="input" type="date" value={date} onChange={(e)=>setDate(e.target.value)} />
          </div>
          <div className="block">
            <label>会場</label>
            <input className="input" value={venue} onChange={(e)=>setVenue(e.target.value)} />
          </div>
          <div className="block">
            <label>ホーム</label>
            <input className="input" value={home} onChange={(e)=>setHome(e.target.value)} />
          </div>
          <div className="block">
            <label>ビジター</label>
            <input className="input" value={visitor} onChange={(e)=>setVisitor(e.target.value)} />
          </div>
        </div>

        <div className="space" />
        <button className="btn" onClick={createGame} disabled={saving}>
          {saving ? '作成中…' : '作成'}
        </button>
        <div className="space" />
        <Link className="muted" to="/">&laquo; トップへ</Link>
      </div>

      {/* 未ログインで「作成」を押したときのモーダル */}
      {showAuth && (
        <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,.6)', display:'grid', placeItems:'center', zIndex:1000}}>
          <div className="card" style={{width:'min(600px, 92vw)'}}>
            <div className="row between">
              <h3>サインイン / ユーザー作成</h3>
              <button className="btn gray" onClick={()=>setShowAuth(false)}>閉じる</button>
            </div>
            <div style={{marginTop:12}}>
              <Authenticator signUpAttributes={['email']}>
                {({ user }) => {
                  if (user && showAuth) { setSignedIn(true); setShowAuth(false) }
                  return null
                }}
              </Authenticator>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// =============== Game（閲覧/編集） ===============
function Game() {
  const { id: gameId } = useParams()
  const [signedIn, setSignedIn] = useState(false)
  const [game, setGame] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [plays, setPlays] = useState<any[]>([])
  const [editMode, setEditMode] = useState(false)
  const [serverToken, setServerToken] = useState<string | null>(null)

  // 認証状態
  useEffect(() => {
    (async () => {
      try { await getCurrentUser(); setSignedIn(true) } catch { setSignedIn(false) }
    })()
  }, [])

  // Game 取得（IAM→UserPool）
  useEffect(() => {
    if (!gameId) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const r: any = await client.graphql({ query: GET_GAME, variables: { id: gameId }, authMode: 'iam' })
        if (!cancelled) {
          setGame(r?.data?.getGame || null)
          setServerToken(r?.data?.getGame?.editToken || null)
        }
      } catch {
        try {
          const r: any = await client.graphql({ query: GET_GAME, variables: { id: gameId }, authMode: 'userPool' })
          if (!cancelled) {
            setGame(r?.data?.getGame || null)
            setServerToken(r?.data?.getGame?.editToken || null)
          }
        } catch (e) {
          console.error(e)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [gameId])

  // 編集モード：token クエリ/LocalStorage
  useEffect(() => {
    const qs = new URLSearchParams(location.search)
    const t = qs.get('token') || localStorage.getItem(`editToken:${gameId}`)
    if (t && serverToken && t === serverToken) {
      setEditMode(true)
      localStorage.setItem(`editToken:${gameId}`, t)
    }
  }, [serverToken, gameId])

  // Plays 読み込み
  const loadPlays = async () => {
    if (!gameId) return
    try {
      const r: any = await client.graphql({
        query: LIST_PLAYS_BY_GAME,
        variables: { gameId, sortDirection: 'ASC' },
        authMode: signedIn ? 'userPool' : 'iam'
      })
      setPlays(r?.data?.listPlaysByGame?.items || [])
    } catch {
      const r: any = await client.graphql({
        query: LIST_PLAYS_FALLBACK,
        variables: { filter: { gameId: { eq: gameId } }, limit: 1000 },
        authMode: signedIn ? 'userPool' : 'iam'
      })
      const items = (r?.data?.listPlays?.items || []).sort((a: any, b: any) =>
        (a.createdAt || '').localeCompare(b.createdAt || '')
      )
      setPlays(items)
    }
  }
  useEffect(() => { loadPlays() }, [gameId, signedIn])

  // サブスク
  useEffect(() => {
    const mode = signedIn ? 'userPool' : 'iam'
    const sub1: any = (client.graphql({ query: ON_CREATE_PLAY, authMode: mode }) as any).subscribe?.({
      next: ({ data }: any) => {
        const p = data?.onCreatePlay
        if (p?.gameId !== gameId) return
        setPlays(prev => prev.some(x => x.id === p.id) ? prev : [...prev, p].sort((a: any, b: any) =>
          (a.createdAt || '').localeCompare(b.createdAt || '')
        ))
      }, error: (e: any) => console.warn('sub create', e)
    })
    const sub2: any = (client.graphql({ query: ON_UPDATE_PLAY, authMode: mode }) as any).subscribe?.({
      next: ({ data }: any) => {
        const p = data?.onUpdatePlay
        if (p?.gameId !== gameId) return
        setPlays(prev => prev.map(x => x.id === p.id ? { ...x, ...p } : x))
      }, error: (e: any) => console.warn('sub update', e)
    })
    return () => { try { sub1?.unsubscribe?.() } catch { } try { sub2?.unsubscribe?.() } catch { } }
  }, [gameId, signedIn])

  // スコアボード
  const board = useMemo(() => {
    const blank = { Q1: 0, Q2: 0, Q3: 0, Q4: 0, Total: 0 }
    const H = { ...blank }, V = { ...blank }
    plays.forEach(p => {
      const q = (p.q || '1Q') as string
      const tm = p.scoreTeam
      const pt = scorePoints(p.scoreMethod)
      if (pt <= 0 || !tm) return
      const row = tm === 'home' ? H : V
      const key = ({ '1Q': 'Q1', '2Q': 'Q2', '3Q': 'Q3', '4Q': 'Q4' } as any)[q] || 'Q1'
      ;(row as any)[key] += pt
      row.Total += pt
    })
    return { H, V }
  }, [plays])

  if (loading) return <div className="page"><Header title="【JPFF East】" subtitle="Game Scorer" /><div className="card">読み込み中…</div></div>
  if (!game) return <div className="page"><Header title="【JPFF East】" subtitle="Game Scorer" /><div className="card">試合が見つかりません。<div className="space" /><Link to="/" className="muted">トップへ</Link></div></div>

  return (
    <div className="page">
      <Header title="【JPFF East】" subtitle="Game Scorer" />
      {/* スコアボード */}
      <div className="score card">
        <table className="scoreTbl">
          <thead><tr><th></th><th>1Q</th><th>2Q</th><th>3Q</th><th>4Q</th><th>Total</th></tr></thead>
          <tbody>
            <tr><th>{game.home ?? 'Home'}</th><td>{board.H.Q1}</td><td>{board.H.Q2}</td><td>{board.H.Q3}</td><td>{board.H.Q4}</td><td>{board.H.Total}</td></tr>
            <tr><th>{game.visitor ?? 'Visitor'}</th><td>{board.V.Q1}</td><td>{board.V.Q2}</td><td>{board.V.Q3}</td><td>{board.V.Q4}</td><td>{board.V.Total}</td></tr>
          </tbody>
        </table>
      </div>

      {/* 入力フォーム */}
      <PlayEditor
        game={game}
        plays={plays}
        editMode={editMode || signedIn}
        onSaved={() => loadPlays()}
        onToggleEdit={(on) => setEditMode(on)}
      />

      <div className="card">
        <PlaysTable plays={plays} home={game.home ?? 'Home'} visitor={game.visitor ?? 'Visitor'} />
      </div>

      <footer className="footer">
        <div className="row gap">
          <button className="btn gray" onClick={() => navigator.clipboard.writeText(location.href)}>URLコピー</button>
          <CSVButton plays={plays} home={game.home ?? 'Home'} visitor={game.visitor ?? 'Visitor'} />
        </div>
      </footer>
    </div>
  )
}

// =============== Editor ===============
type EditorProps = {
  game: any
  plays: any[]
  editMode: boolean
  onSaved: () => void
  onToggleEdit: (on: boolean) => void
}

function PlayEditor({ game, plays, editMode, onSaved, onToggleEdit }: EditorProps) {
  const [p, setP] = useState<any>(newPlay(game))
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [highlightTime, setHighlightTime] = useState(false)

  const lastPasserHome = useMemo(() => [...plays].reverse().find(x => x.attackTeam === 'home' && isNum(x.passerNo))?.passerNo || '', [plays])
  const lastPasserVisitor = useMemo(() => [...plays].reverse().find(x => x.attackTeam === 'visitor' && isNum(x.passerNo))?.passerNo || '', [plays])

  useEffect(() => { setHighlightTime(true); const t = setTimeout(()=>setHighlightTime(false), 800); return ()=>clearTimeout(t) }, [p.attackTeam])

  useEffect(() => {
    if (isNum(p.gainYds) && isNum(p.toGo)) {
      setP((s: any) => ({ ...s, fd: Number(s.gainYds) >= Number(s.toGo) ? true : s.fd }))
    }
  }, [p.gainYds, p.toGo])

  useEffect(() => {
    if (p.playType === 'Kick off' || p.playType === 'Punt' || p.playType === 'Field goal') {
      setP((s: any) => ({ ...s, down: 1, toGo: 10, fd: false }))
    }
  }, [p.playType])

  useEffect(() => {
    if (p.playType === 'Spike/Knee down' || p.playType === 'Time out') {
      setP((s: any) => ({ ...s, gainYds: 0 }))
    }
  }, [p.playType])

  useEffect(() => {
    if (!isNum(p.ballOn) || !isNum(p.gainYds)) return
    if (!['Run', 'Pass', 'Penalty', 'Spike/Knee down'].includes(p.playType || '')) return
    const sign = p.fieldPos === 'H' ? 1 : -1
    let next = Number(p.ballOn) + sign * Number(p.gainYds)
    next = Math.max(1, Math.min(50, next))
    setP((s: any) => ({ ...s, ballOn: next }))
  }, [p.gainYds])

  const fdHint = isNum(p.gainYds) && isNum(p.toGo) && Number(p.gainYds) >= Number(p.toGo)

  const save = async () => {
    setSaving(true)
    try {
      const base = { ...p, gameId: game.id, createdAt: p.createdAt || new Date().toISOString() }
      const auth = 'userPool'
      if (editingId) {
        await client.graphql({ query: UPDATE_PLAY, variables: { input: { ...base, id: editingId } }, authMode: auth })
      } else {
        await client.graphql({ query: CREATE_PLAY, variables: { input: base }, authMode: auth })
      }
      setP(newPlay(game))
      setEditingId(null)
      onSaved()
    } catch (e: any) {
      alert(e?.errors?.[0]?.message || e?.message || '保存に失敗しました')
    } finally { setSaving(false) }
  }

  const startEdit = (row: any) => { setEditingId(row.id); setP({ ...row }) }
  const last = plays[plays.length - 1]
  useEffect(() => { (window as any).__editLast = () => last && startEdit(last) }, [last])

  return (
    <div className="card">
      <div className="row between">
        <h3>試合情報（編集 {editMode ? 'ON' : 'OFF'}）</h3>
        <div className="row gap">
          <button className="btn gray" onClick={() => onToggleEdit(!editMode)}>{editMode ? '編集OFF' : '編集ON'}</button>
          <Link className="btn gray" to="/">トップ</Link>
        </div>
      </div>

      {/* 入力エリア */}
      <div className="grid4" style={{ opacity: editMode ? 1 : .5, pointerEvents: editMode ? 'auto' : 'none' }}>
        <div className="block">
          <label>Q</label>
          <div className="seg">
            {['1Q', '2Q', '3Q', '4Q', 'OT'].map(q =>
              <button key={q} className={`chip ${p.q === q ? 'on' : ''}`} onClick={() => setP({ ...p, q })}>{q}</button>
            )}
          </div>
        </div>

        <div className={`block ${highlightTime ? 'hilite' : ''}`}>
          <label>試合時間</label>
          <input className="input" type="time" value={p.time} onChange={e => setP({ ...p, time: e.target.value })} />
        </div>

        <div className="block">
          <label>Field position</label>
          <div className="seg">
            {['H', 'V'].map(s =>
              <button key={s} className={`chip ${p.fieldPos === s ? 'on' : ''}`} onClick={() => setP({ ...p, fieldPos: s })}>
                {s === 'H' ? '自陣 (H)' : '敵陣 (V)'}
              </button>
            )}
          </div>
        </div>

        <div className="block">
          <label>攻撃</label>
          <div className="seg">
            {['home', 'visitor'].map(t =>
              <button key={t} className={`chip ${p.attackTeam === t ? 'on' : ''}`} onClick={() => setP({ ...p, attackTeam: t, passerNo: t === 'home' ? lastPasserHome : lastPasserVisitor })}>
                {t === 'home' ? 'ホーム' : 'ビジター'}
              </button>
            )}
          </div>
        </div>

        <NumBox label="BALL ON (1-50)" value={p.ballOn} setValue={v => setP({ ...p, ballOn: v })} min={1} max={50} />
        <NumBox label="TO GO (1-50)" value={p.toGo} setValue={v => setP({ ...p, toGo: v })} min={1} max={50} />

        <div className="block">
          <label>DOWN</label>
          <div className="seg">
            {[1, 2, 3, 4].map(d =>
              <button key={d} className={`chip ${p.down === d ? 'on' : ''}`} onClick={() => setP({ ...p, down: d })}>{d}</button>
            )}
          </div>
        </div>

        <NumBox label="獲得Yds" value={p.gainYds} setValue={v => setP({ ...p, gainYds: v })} allowNegative />
      </div>

      {/* プレー選択 */}
      <div className="grid3">
        {['Run', 'Pass', 'Penalty',
          'Kick off', 'Punt', 'Field goal',
          'TFP(Kick)', 'TFP(Run)', 'TFP(Pass)',
          'Spike/Knee down', 'Safety', 'Time out'].map((k) =>
            <button key={k} className={`sel ${p.playType === k ? 'on' : ''}`} onClick={() => setP({ ...p, playType: k })}>
              {k}
            </button>
          )}
      </div>

      {/* First down / Sack */}
      <div className="grid2">
        <div className="block">
          <label>必要時に選択</label>
          <div className="seg">
            <button className={`chip ${p.fd ? 'on' : ''}`} onClick={() => setP({ ...p, fd: !p.fd })}>First down 獲得</button>
          </div>
          {fdHint && <small className="muted">Yds ≥ TG のため First down を推奨</small>}
        </div>
        <div className="block">
          <label>必要時に選択</label>
          <div className="seg">
            <button className={`chip ${p.sack ? 'on' : ''}`} onClick={() => setP({ ...p, sack: !p.sack })}>Sack</button>
          </div>
        </div>
      </div>

      {/* 人物番号など */}
      <div className="grid4">
        <NumBox label="QB/Passer #" value={p.passerNo} setValue={v => setP({ ...p, passerNo: v })} />
        <NumBox label="RB/WR/Kicker #" value={p.kickerNo} setValue={v => setP({ ...p, kickerNo: v })} />
        <NumBox label="TACKLER #1" value={p.tacklerNo} setValue={v => setP({ ...p, tacklerNo: v })} />
        <NumBox label="TACKLER #2 (同時の場合はこちらに記載)" value={p.tacklerNo2} setValue={v => setP({ ...p, tacklerNo2: v })} />
        <NumBox label="INTERCEPTER/PASS Defense #" value={p.interceptorNo} setValue={v => setP({ ...p, interceptorNo: v })} />
        <Select label="TURNOVER" value={p.turnover} setValue={v => setP({ ...p, turnover: v })}
          options={['-', 'Intercept', 'Fumble', '4th down失敗', 'Safety']} />
        <NumBox label="罰則Y" value={p.penaltyY} setValue={v => setP({ ...p, penaltyY: v })} />
        <TextField label="備考 (上記で記載できない場合に利用)" value={p.remarks ?? ''} onChange={e => setP({ ...p, remarks: e.target.value })} />
      </div>

      {/* 得点 */}
      <div className="grid3">
        <Select label="得点チーム" value={p.scoreTeam} setValue={v => setP({ ...p, scoreTeam: v })}
          options={['-', 'home', 'visitor']} displayMap={{ home: game.home ?? 'Home', visitor: game.visitor ?? 'Visitor', '-': '-' }} />
        <Select label="得点方法" value={p.scoreMethod} setValue={v => setP({ ...p, scoreMethod: v })}
          options={['-', 'TD', 'FG', 'Safety', 'TFP(Kick)', 'TFP(Run)', 'TFP(Pass)']} />
        <div />
      </div>

      {/* 操作ボタン */}
      <div className="row gap">
        <button className="btn" style={{ minWidth: 160 }} disabled={!editMode || saving} onClick={save}>
          {editingId ? '変更を保存' : '1行追加'}
        </button>
        {editingId &&
          <button className="btn white" onClick={() => { setEditingId(null); setP(newPlay(game)) }}>
            変更のキャンセル
          </button>}
        {editingId &&
          <button className="btn danger" onClick={async () => {
            if (!confirm('削除しますか？')) return
            await client.graphql({ query: DELETE_PLAY, variables: { input: { id: editingId } }, authMode: 'userPool' })
            setEditingId(null); setP(newPlay(game)); onSaved()
          }}>行削除</button>}
      </div>

      <div className="space" />
      <ExistingPlaysMini plays={plays} onEdit={(row) => startEdit(row)} />
    </div>
  )
}

// =============== 小コンポーネント ===============
function ExistingPlaysMini({ plays, onEdit }: { plays: any[], onEdit: (row: any) => void }) {
  return (
    <div className="miniTbl">
      <div className="row head">
        <div>Q</div><div>時刻</div><div>攻撃</div><div>位置</div><div>DN</div><div>TG</div><div>種別</div><div>Yds</div><div>FD</div><div></div>
      </div>
      {plays.slice(-8).reverse().map((p) =>
        <div key={p.id} className="row">
          <div>{p.q}</div>
          <div>{p.time}</div>
          <div>{p.attackTeam === 'home' ? 'H' : 'V'}</div>
          <div>{p.fieldPos}{p.ballOn}</div>
          <div>{p.down}</div>
          <div>{p.toGo}</div>
          <div>{p.playType}</div>
          <div>{p.gainYds}</div>
          <div>{p.fd ? 'Y' : 'N'}</div>
          <div><button className="link" onClick={() => onEdit(p)}>編集</button></div>
        </div>
      )}
    </div>
  )
}

function PlaysTable({ plays, home, visitor }: { plays: any[], home: string, visitor: string }) {
  return (
    <>
      <h3>プレー一覧（最新が上）</h3>
      <div className="tableWrap">
        <table className="table">
          <thead>
            <tr>
              <th>Q</th><th>時計</th><th>攻撃</th><th>位置</th><th>DN</th><th>TG</th><th>種別</th><th>Yds</th><th>FD</th><th>備考</th>
              <th>得点チーム</th><th>得点方法</th>
            </tr>
          </thead>
          <tbody>
            {[...plays].reverse().map((p) =>
              <tr key={p.id}>
                <td>{p.q}</td>
                <td>{p.time}</td>
                <td>{p.attackTeam === 'home' ? home : visitor}</td>
                <td>{p.fieldPos}{p.ballOn}</td>
                <td>{p.down}</td>
                <td>{p.toGo}</td>
                <td>{p.playType}{p.sack ? ' (Sack)' : ''}</td>
                <td>{p.gainYds}</td>
                <td>{p.fd ? 'Y' : 'N'}</td>
                <td>{p.remarks}</td>
                <td>{p.scoreTeam === 'home' ? home : p.scoreTeam === 'visitor' ? visitor : '-'}</td>
                <td>{p.scoreMethod || '-'}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}

function CSVButton({ plays, home, visitor }: { plays: any[], home: string, visitor: string }) {
  const click = () => {
    const header = ['Q', '時刻', '攻撃', 'BALL ON', 'TO GO', 'DN', '種別', 'Yds', 'FD', 'TACKLER1', 'TACKLER2', 'INT/PD', 'TURNOVER', '罰則Y', '備考', '得点チーム', '得点方法']
    const rows = plays.map(p => [
      p.q, p.time, p.attackTeam === 'home' ? home : visitor, `${p.fieldPos}${p.ballOn}`, p.toGo, p.down, p.playType + (p.sack ? ' (Sack)' : ''),
      p.gainYds, p.fd ? 'Y' : 'N', p.tacklerNo || '', p.tacklerNo2 || '', p.interceptorNo || '', p.turnover || '', p.penaltyY || '',
      p.remarks || '', p.scoreTeam === 'home' ? home : p.scoreTeam === 'visitor' ? visitor : '', p.scoreMethod || ''
    ])
    const csv = [header, ...rows].map(r => r.map(s => `"${(s ?? '').toString().replace(/"/g, '""')}"`).join(',')).join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `game_${to2(new Date().getMonth() + 1)}${to2(new Date().getDate())}.csv`
    a.click()
  }
  return <button className="btn gray" onClick={click}>CSV出力</button>
}

function NumBox({ label, value, setValue, min, max, allowNegative }: { label: string, value: any, setValue: (n: number | null) => void, min?: number, max?: number, allowNegative?: boolean }) {
  return (
    <div className="block">
      <label>{label}</label>
      <input
        className="input big"
        inputMode="numeric"
        pattern="[0-9]*"
        value={value ?? ''}
        onChange={e => {
          const t = e.target.value
          if (t === '') { setValue(null); return }
          const n = Number(t)
          if (Number.isNaN(n)) return
          if (!allowNegative && n < 0) return
          if (min != null && n < min) { setValue(min); return }
          if (max != null && n > max) { setValue(max); return }
          setValue(n)
        }}
      />
    </div>
  )
}

function Select({ label, value, setValue, options, displayMap }: { label: string, value: any, setValue: (v: any) => void, options: string[], displayMap?: Record<string, string> }) {
  return (
    <div className="block">
      <label>{label}</label>
      <select className="input" value={value ?? '-'} onChange={e => setValue(e.target.value)}>
        {options.map(o => <option key={o} value={o}>{displayMap?.[o] ?? o}</option>)}
      </select>
    </div>
  )
}

function Header({ title, subtitle }: { title: string, subtitle: string }) {
  return (
    <div className="header">
      <div className="title">{title}<br />{subtitle}</div>
      <div className="icons">
        <a className="icon" onClick={() => navigator.clipboard.writeText(location.href)} title="URLコピー">⎘</a>
        <Authenticator variation="modal">
          {({ signOut, user }) => (
            user
              ? <a className="icon" onClick={signOut} title="サインアウト">⇦</a>
              : <span />
          )}
        </Authenticator>
      </div>
    </div>
  )
}

function NotFound() {
  return <div className="page"><Header title="【JPFF East】" subtitle="Game Scorer" /><div className="card">ページが見つかりません。</div></div>
}

function newPlay(_: any) {
  return {
    q: '1Q',
    time: '12:00',
    attackTeam: 'home',
    fieldPos: 'H',
    ballOn: null as number | null,
    toGo: null as number | null,
    down: 1,
    gainYds: null as number | null,
    playType: '',
    fd: false,
    sack: false,
    passerNo: '',
    kickerNo: '',
    tacklerNo: '',
    tacklerNo2: '',
    interceptorNo: '',
    turnover: '-',
    penaltyY: null as number | null,
    remarks: '',
    scoreTeam: '-',
    scoreMethod: '-'
  }
}

// =============== Styles ===============
function GlobalStyle() {
  return (
    <style>{`
  :root { --bg:#0a0d12; --card:#121821; --muted:#9fb2c3; --fg:#eaf0f5; --pri:#0ea5a4; --chip:#1f2a37; --chipOn:#0b6477; --danger:#c23636; }
  *{ box-sizing:border-box; }
  body{ margin:0; background:var(--bg); color:var(--fg); font:16px/1.6 "Meiryo UI","Century Gothic",system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans JP"; }
  .page{ max-width:1100px; margin:0 auto; padding:16px; }
  .header{ display:flex; align-items:center; justify-content:space-between; margin:8px 0 16px; }
  .title{ font-weight:700; font-size:28px; line-height:1.2; }
  .icons .icon{ display:inline-block; margin-left:10px; padding:8px 10px; background:#2b3746; color:#fff; border-radius:10px; cursor:pointer; }
  .card{ background:var(--card); border-radius:16px; padding:16px; margin:12px 0; box-shadow:0 8px 24px rgba(0,0,0,.25); }
  .row{ display:flex; align-items:center; }
  .between{ justify-content:space-between; }
  .gap{ gap:12px; }
  .stack{ display:flex; flex-direction:column; gap:10px; }
  .grid2{ display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .grid3{ display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
  .grid4{ display:grid; grid-template-columns:repeat(4,1fr); gap:12px; }
  @media (max-width:860px){ .grid4{ grid-template-columns:1fr 1fr; } .grid3{ grid-template-columns:1fr 1fr 1fr; } .grid2{ grid-template-columns:1fr; } .title{font-size:22px;} }
  .block{ display:flex; flex-direction:column; gap:6px; }
  label{ color:var(--muted); font-size:14px; }
  .input{ width:100%; border:1px solid #324153; background:#0f141b; color:#fff; padding:10px 12px; border-radius:12px; }
  .input.big{ font-size:20px; font-weight:700; }
  .btn{ background:var(--pri); color:#fff; border:none; padding:12px 18px; border-radius:12px; cursor:pointer; font-weight:700; }
  .btn.gray{ background:#2b3746; }
  .btn.white{ background:#fff; color:#000; }
  .btn.danger{ background:var(--danger); }
  .sel{ background:#253243; border:1px solid #324153; color:#fff; padding:10px; border-radius:14px; font-weight:700; }
  .sel.on{ background:var(--chipOn); }
  .seg{ display:flex; flex-wrap:wrap; gap:8px; }
  .chip{ background:var(--chip); color:#fff; padding:8px 12px; border:1px solid #314052; border-radius:999px; }
  .chip.on{ background:var(--chipOn); border-color:transparent; }
  .space{ height:12px; }
  .muted{ color:var(--muted); }
  .miniTbl{ border-top:1px solid #2c3a4a; margin-top:10px; }
  .miniTbl .row{ display:grid; grid-template-columns:60px 70px 60px 80px 50px 50px 1fr 60px 40px 60px; gap:8px; padding:6px 0; border-bottom:1px solid #203041; align-items:center; }
  .miniTbl .head{ color:var(--muted); font-weight:700; }
  .link{ color:#a7e0ff; background:none; border:none; cursor:pointer; text-decoration:underline; }
  .tableWrap{ overflow:auto; }
  table.table{ width:100%; border-collapse:collapse; }
  table.table th, table.table td{ border-bottom:1px solid #233042; padding:8px 10px; text-align:left; }
  table.table th{ color:var(--muted); font-weight:700; }
  .footer{ display:flex; justify-content:center; gap:16px; }
  .scoreTbl{ width:100%; border-collapse:collapse; }
  .scoreTbl th, .scoreTbl td{ border-bottom:1px solid #263648; padding:6px 8px; text-align:center; }
  .scoreTbl th:first-child, .scoreTbl td:first-child{ text-align:left; }
  .hilite .input{ background:#584a00; }
  `}</style>
  )
}
