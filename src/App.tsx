/* eslint-disable @typescript-eslint/no-explicit-any */
// App.tsx — Dark UI + full play editor, team names are stored locally only.

import React, { useEffect, useMemo, useState } from 'react'
import { BrowserRouter, Routes, Route, Link, useNavigate, useParams } from 'react-router-dom'
import { Authenticator } from '@aws-amplify/ui-react'
import '@aws-amplify/ui-react/styles.css'
import { generateClient } from 'aws-amplify/api'
import { getCurrentUser } from 'aws-amplify/auth'

// ===== Amplify client =====
const client = generateClient()

// ===== GraphQL (Game/Play だけ。Team は使わない) =====
const GET_GAME = /* GraphQL */ `
  query GetGame($id: ID!) {
    getGame(id: $id) { id date venue home homeTeamID awayTeamID status editToken }
  }
`
const CREATE_GAME_BY_TEAMID = /* GraphQL */ `
  mutation CreateGame($input: CreateGameInput!) {
    createGame(input: $input) { id date venue homeTeamID awayTeamID status editToken }
  }
`
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
  subscription OnCreatePlay { onCreatePlay {
    id gameId createdAt
    q time attackTeam fieldPos ballOn toGo down gainYds
    playType fd sack
    passerNo runnerNo kickerNo
    tacklerNo tacklerNo2 interceptorNo
    turnover penaltyY remarks
    scoreTeam scoreMethod
  } }
`
const ON_UPDATE_PLAY = /* GraphQL */ `
  subscription OnUpdatePlay { onUpdatePlay {
    id gameId createdAt
    q time attackTeam fieldPos ballOn toGo down gainYds
    playType fd sack
    passerNo runnerNo kickerNo
    tacklerNo tacklerNo2 interceptorNo
    turnover penaltyY remarks
    scoreTeam scoreMethod
  } }
`

// ===== Local team-name store (端末ローカル) =====
type LocalNames = { home?: string; visitor?: string }
const LS_KEY = (gameId: string) => `jpff:gameNames:${gameId}`
const setLocalNames = (gameId: string, names: LocalNames) =>
  localStorage.setItem(LS_KEY(gameId), JSON.stringify(names))
const getLocalNames = (gameId: string): LocalNames => {
  try { return JSON.parse(localStorage.getItem(LS_KEY(gameId)) || '{}') } catch { return {} }
}

// ===== Utils =====
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
const uuid = () => Math.random().toString(36).slice(2) + Date.now().toString(36)

// ===== App root =====
export default function App() {
  return (
    <>
      <Style />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="/game/:id" element={<Game />} />
          <Route path="*" element={<NF />} />
        </Routes>
      </BrowserRouter>
    </>
  )
}

// ===== Home =====
function Home() {
  const [signedIn, setSignedIn] = useState(false)
  useEffect(() => { (async () => { try { await getCurrentUser(); setSignedIn(true) } catch { setSignedIn(false) } })() }, [])
  return (
    <div className="page">
      <Header title="【JPFF East】" subtitle="Game Scorer" />
      <div className="card">
        {!signedIn && (
          <>
            <h3>サインイン / ユーザー作成</h3>
            {/* ダークモード固定 */}
            <div style={{ marginTop: 10 }}>
              <Authenticator signUpAttributes={['email']} />
            </div>
            <div className="space" />
          </>
        )}
        <div className="row gap">
          <Link className="btn" to="/setup">試合を作成</Link>
        </div>
      </div>
    </div>
  )
}

// ===== Setup（試合作成：チーム名はローカル保存のみ） =====
function Setup() {
  const nav = useNavigate()
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [venue, setVenue] = useState('')
  const [home, setHome] = useState('')
  const [visitor, setVisitor] = useState('')
  const [saving, setSaving] = useState(false)
  const [signedIn, setSignedIn] = useState(false)
  const [showAuth, setShowAuth] = useState(false)

  useEffect(() => { (async () => { try { await getCurrentUser(); setSignedIn(true) } catch { setSignedIn(false) } })() }, [])

  const createGame = async () => {
    if (!home || !visitor) { alert('ホーム / ビジター を入力してください'); return }
    if (!signedIn) { setShowAuth(true); return }
    setSaving(true)
    try {
      const input = {
        date, venue,
        homeTeamID: 'H_' + uuid(),
        awayTeamID: 'V_' + uuid(),
        status: 'scheduled'
      }
      const r: any = await client.graphql({ query: CREATE_GAME_BY_TEAMID, variables: { input }, authMode: 'userPool' })
      const id = r?.data?.createGame?.id
      if (!id) throw new Error('createGame failed')
      setLocalNames(id, { home, visitor })
      nav(`/game/${id}`)
    } catch (e: any) {
      alert(e?.errors?.[0]?.message || e?.message || '作成に失敗しました')
    } finally { setSaving(false) }
  }

  return (
    <div className="page">
      <Header title="【JPFF East】" subtitle="Game Scorer" />
      <div className="card">
        <h2>試合作成（サインインが必要）</h2>
        <div className="grid2">
          <div className="block"><label>試合日</label>
            <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="block"><label>会場</label>
            <input className="input" value={venue} onChange={e => setVenue(e.target.value)} />
          </div>
          <div className="block"><label>ホーム</label>
            <input className="input" value={home} onChange={e => setHome(e.target.value)} placeholder="例) ブラウンディングス" />
          </div>
          <div className="block"><label>ビジター</label>
            <input className="input" value={visitor} onChange={e => setVisitor(e.target.value)} placeholder="例) 鎌倉ラザロ" />
          </div>
        </div>
        <div className="space" />
        <button className="btn" disabled={saving} onClick={createGame}>{saving ? '作成中…' : '作成'}</button>
        <div className="space" />
        <Link className="muted" to="/">&laquo; トップへ</Link>
      </div>

      {showAuth && (
        <div className="modal">
          <div className="card" style={{ width: 'min(620px,92vw)' }}>
            <div className="row between">
              <h3>サインイン / ユーザー作成</h3>
              <button className="btn gray" onClick={() => setShowAuth(false)}>閉じる</button>
            </div>
            <div style={{ marginTop: 12 }}>
               <Authenticator signUpAttributes={['email']}>
                {({ user }) => { if (user) { setShowAuth(false) } return null }}
              </Authenticator>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ===== Game =====
function Game() {
  const { id: gameId } = useParams()
  const [signedIn, setSignedIn] = useState(false)
  const [game, setGame] = useState<any>(null)
  const [plays, setPlays] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { (async () => { try { await getCurrentUser(); setSignedIn(true) } catch { setSignedIn(false) } })() }, [])
  const names = useMemo(() => gameId ? getLocalNames(gameId) : {}, [gameId])
  const homeName = game?.home || names.home || 'Home'
  const visitorName = game?.visitor || names.visitor || 'Visitor'

  // Game 取得
  useEffect(() => {
    if (!gameId) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const r: any = await client.graphql({ query: GET_GAME, variables: { id: gameId }, authMode: 'iam' })
        if (!cancelled) setGame(r?.data?.getGame || null)
      } catch {
        try {
          const r: any = await client.graphql({ query: GET_GAME, variables: { id: gameId }, authMode: 'userPool' })
          if (!cancelled) setGame(r?.data?.getGame || null)
        } catch { /* ignore */ }
      } finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [gameId])

  // Plays 取得
  const loadPlays = async () => {
    if (!gameId) return
    try {
      const r: any = await client.graphql({
        query: LIST_PLAYS_BY_GAME, variables: { gameId, sortDirection: 'ASC' },
        authMode: signedIn ? 'userPool' : 'iam'
      })
      setPlays(r?.data?.listPlaysByGame?.items || [])
    } catch {
      const r: any = await client.graphql({
        query: LIST_PLAYS_FALLBACK, variables: { filter: { gameId: { eq: gameId } }, limit: 1000 },
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
    const s1: any = (client.graphql({ query: ON_CREATE_PLAY, authMode: mode }) as any).subscribe?.({
      next: ({ data }: any) => {
        const p = data?.onCreatePlay
        if (p?.gameId !== gameId) return
        setPlays(prev => prev.some(x => x.id === p.id) ? prev : [...prev, p].sort((a: any, b: any) =>
          (a.createdAt || '').localeCompare(b.createdAt || '')
        ))
      }
    })
    const s2: any = (client.graphql({ query: ON_UPDATE_PLAY, authMode: mode }) as any).subscribe?.({
      next: ({ data }: any) => {
        const p = data?.onUpdatePlay
        if (p?.gameId !== gameId) return
        setPlays(prev => prev.map(x => x.id === p.id ? { ...x, ...p } : x))
      }
    })
    return () => { try { s1?.unsubscribe?.() } catch { } try { s2?.unsubscribe?.() } catch { } }
  }, [gameId, signedIn])

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
  if (!game) return <div className="page"><Header title="【JPFF East】" subtitle="Game Scorer" /><div className="card">試合が見つかりません。</div></div>

  return (
    <div className="page">
      <Header title="【JPFF East】" subtitle="Game Scorer" />

      <div className="card score">
        <table className="scoreTbl">
          <thead><tr><th></th><th>1Q</th><th>2Q</th><th>3Q</th><th>4Q</th><th>Total</th></tr></thead>
          <tbody>
            <tr><th>{homeName}</th><td>{board.H.Q1}</td><td>{board.H.Q2}</td><td>{board.H.Q3}</td><td>{board.H.Q4}</td><td>{board.H.Total}</td></tr>
            <tr><th>{visitorName}</th><td>{board.V.Q1}</td><td>{board.V.Q2}</td><td>{board.V.Q3}</td><td>{board.V.Q4}</td><td>{board.V.Total}</td></tr>
          </tbody>
        </table>
      </div>

      {/* ここが元の “フル” 入力UI（備考含む） */}
      <PlayEditor gameId={game.id} home={homeName} visitor={visitorName} plays={plays} onSaved={loadPlays} />

      <div className="card">
        <PlaysTable plays={plays} home={homeName} visitor={visitorName} />
      </div>

      <footer className="footer">
        <button className="btn gray" onClick={() => navigator.clipboard.writeText(location.href)}>URLコピー</button>
        <CSVButton plays={plays} home={homeName} visitor={visitorName} />
      </footer>
    </div>
  )
}

// ===== Editor (full fields) =====
function PlayEditor({ gameId, home, visitor, plays, onSaved }:
  { gameId: string, home: string, visitor: string, plays: any[], onSaved: () => void }) {

  const [p, setP] = useState<any>(blankPlay())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isNum(p.gainYds) && isNum(p.toGo)) setP((s: any) => ({ ...s, fd: Number(s.gainYds) >= Number(s.toGo) }))
  }, [p.gainYds, p.toGo])

  const save = async () => {
    setSaving(true)
    try {
      const base = { ...p, gameId, createdAt: p.createdAt || new Date().toISOString() }
      if (editingId) {
        await client.graphql({ query: UPDATE_PLAY, variables: { input: { ...base, id: editingId } }, authMode: 'userPool' })
      } else {
        await client.graphql({ query: CREATE_PLAY, variables: { input: base }, authMode: 'userPool' })
      }
      setP(blankPlay()); setEditingId(null); onSaved()
    } catch (e: any) {
      alert(e?.errors?.[0]?.message || e?.message || '保存に失敗しました')
    } finally { setSaving(false) }
  }
  const edit = (row: any) => { setEditingId(row.id); setP({ ...row }) }

  return (
    <div className="card">
      <h3>プレー入力（1行単位）</h3>
      <div className="grid4">
        <Select label="Q" value={p.q} setValue={v => setP({ ...p, q: v })} options={['1Q','2Q','3Q','4Q','OT']} />
        <Input label="時計" value={p.time} onChange={v => setP({ ...p, time: v })} type="time" />
        <Select label="攻撃TEAM" value={p.attackTeam} setValue={v=>setP({...p, attackTeam:v})}
          options={['home','visitor']} displayMap={{home:home, visitor:visitor}} />
        <div className="block"><label>BALL ON</label>
          <div className="row gap">
            <Select label="" value={p.fieldPos} setValue={v=>setP({...p, fieldPos:v})} options={['H','V']} />
            <Num label="" value={p.ballOn} setValue={v=>setP({...p, ballOn:v})} min={1} max={50}/>
          </div>
        </div>

        <Select label="DOWN" value={p.down} setValue={v=>setP({...p, down:Number(v)})} options={['1','2','3','4']}/>
        <Num label="TO GO" value={p.toGo} setValue={v=>setP({...p, toGo:v})} min={1} max={50}/>
        <Select label="PLAYS" value={p.playType} setValue={v=>setP({...p, playType:v})}
          options={['Run','Pass','Penalty','Kick off','Punt','Field goal','TFP(Kick)','TFP(Run)','TFP(Pass)','Spike/Knee down','Safety','Time out']} />
        <Num label="獲得Y" value={p.gainYds} setValue={v=>setP({...p, gainYds:v})} allowNegative/>

        <Check label="First down" checked={!!p.fd} setChecked={v=>setP({...p, fd:v})}/>
        <Check label="Sack" checked={!!p.sack} setChecked={v=>setP({...p, sack:v})}/>
        <Num label="PASSER #" value={p.passerNo} setValue={v=>setP({...p, passerNo:v})}/>
        <Num label="RUNNER #" value={p.runnerNo} setValue={v=>setP({...p, runnerNo:v})}/>
        <Num label="KICKER #" value={p.kickerNo} setValue={v=>setP({...p, kickerNo:v})}/>
        <Num label="TACKLE BY #" value={p.tacklerNo} setValue={v=>setP({...p, tacklerNo:v})}/>
        <Num label="TACKLE BY2 #" value={p.tacklerNo2} setValue={v=>setP({...p, tacklerNo2:v})}/>
        <Num label="INT/PD #" value={p.interceptorNo} setValue={v=>setP({...p, interceptorNo:v})}/>
        <Select label="TURNOVER" value={p.turnover} setValue={v=>setP({...p, turnover:v})}
          options={['-','Intercept','Fumble','4th down失敗','Safety']}/>
        <Num label="PENALTY Y" value={p.penaltyY} setValue={v=>setP({...p, penaltyY:v})}/>
        <Select label="得点チーム" value={p.scoreTeam} setValue={v=>setP({...p, scoreTeam:v})}
          options={['-','home','visitor']} displayMap={{'-':'-','home':home,'visitor':visitor}}/>
        <Select label="得点方法" value={p.scoreMethod} setValue={v=>setP({...p, scoreMethod:v})}
          options={['-','TD','FG','Safety','TFP(Kick)','TFP(Run)','TFP(Pass)']}/>
        <div className="block" style={{gridColumn:'1 / -1'}}><label>備考</label>
          <input className="input" value={p.remarks ?? ''} onChange={e=>setP({...p, remarks:e.target.value})}/>
        </div>
      </div>

      <div className="row gap" style={{marginTop:12}}>
        <button className="btn" onClick={save} disabled={saving} style={{minWidth:160}}>{editingId ? '変更を保存' : '1行追加'}</button>
        {editingId && <button className="btn gray" onClick={()=>{ setEditingId(null); setP(blankPlay()) }}>取消</button>}
        {editingId && <button className="btn danger" onClick={async ()=>{
          if (!confirm('削除しますか？')) return
          await client.graphql({ query: DELETE_PLAY, variables: { input:{ id: editingId } }, authMode:'userPool' })
          setEditingId(null); setP(blankPlay()); onSaved()
        }}>行削除</button>}
      </div>

      <div className="space"/>
      <SmallList plays={plays} onEdit={edit}/>
    </div>
  )
}

function SmallList({ plays, onEdit }: { plays:any[], onEdit:(row:any)=>void }) {
  return (
    <div className="miniTbl">
      <div className="row head">
        <div>Q</div><div>時計</div><div>攻撃</div><div>位置</div><div>DN</div><div>TG</div><div>PLAYS</div><div>Yds</div><div>FD</div><div></div>
      </div>
      {plays.slice(-8).reverse().map(p =>
        <div key={p.id} className="row">
          <div>{p.q}</div>
          <div>{p.time}</div>
          <div>{p.attackTeam}</div>
          <div>{p.fieldPos}{p.ballOn}</div>
          <div>{p.down}</div>
          <div>{p.toGo}</div>
          <div>{p.playType}{p.sack?' (Sack)':''}</div>
          <div>{p.gainYds}</div>
          <div>{p.fd?'Y':'N'}</div>
          <div><button className="link" onClick={()=>onEdit(p)}>編集</button></div>
        </div>
      )}
    </div>
  )
}

function PlaysTable({ plays, home, visitor }:{ plays:any[], home:string, visitor:string }) {
  return (
    <>
      <h3>プレー一覧（最新が上）</h3>
      <div className="tableWrap">
        <table className="table">
          <thead><tr>
            <th>Q</th><th>時計</th><th>攻撃</th><th>位置</th><th>DN</th><th>TG</th><th>PLAYS</th><th>Yds</th><th>FD</th><th>備考</th><th>得点チーム</th><th>得点方法</th>
          </tr></thead>
          <tbody>
            {[...plays].reverse().map(p =>
              <tr key={p.id}>
                <td>{p.q}</td>
                <td>{p.time}</td>
                <td>{p.attackTeam==='home'?home: p.attackTeam==='visitor'?visitor: p.attackTeam}</td>
                <td>{p.fieldPos}{p.ballOn}</td>
                <td>{p.down}</td>
                <td>{p.toGo}</td>
                <td>{p.playType}{p.sack?' (Sack)':''}</td>
                <td>{p.gainYds}</td>
                <td>{p.fd?'Y':'N'}</td>
                <td>{p.remarks}</td>
                <td>{p.scoreTeam==='home'?home: p.scoreTeam==='visitor'?visitor: '-'}</td>
                <td>{p.scoreMethod||'-'}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}

function CSVButton({ plays, home, visitor }:{ plays:any[], home:string, visitor:string }) {
  const click = () => {
    const header = ['Q','時刻','攻撃TEAM','BALL ON','DOWN','TO GO','PLAYS','獲得Y','FD','TACKLE BY','TACKLE BY2','INT/PD','PENALTYY','REMARKS','得点(H/V)','得点方法']
    const rows = plays.map(p => [
      p.q, p.time,
      p.attackTeam==='home'?home: p.attackTeam==='visitor'?visitor: p.attackTeam,
      `${p.fieldPos}${p.ballOn ?? ''}`,
      p.down ?? '',
      p.toGo ?? '',
      p.playType + (p.sack?' (Sack)':''),
      p.gainYds ?? '',
      p.fd ? '○' : '',
      p.tacklerNo ?? '',
      p.tacklerNo2 ?? '',
      p.interceptorNo ?? '',
      p.penaltyY ?? '',
      p.remarks ?? '',
      p.scoreTeam==='home'?'H': p.scoreTeam==='visitor'?'V':'',
      p.scoreMethod ?? ''
    ])
    const csv = [header, ...rows]
      .map(r => r.map(s => `"${String(s ?? '').replace(/"/g,'""')}"`).join(','))
      .join('\r\n')
    const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `game_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
  }
  return <button className="btn gray" onClick={click}>CSV出力</button>
}

// ---- tiny inputs ----
function Input({ label, value, onChange, type='text' }:{ label:string, value:any, onChange:(v:string)=>void, type?:string }) {
  return (<div className="block"><label>{label}</label><input className="input" type={type} value={value ?? ''} onChange={e=>onChange(e.target.value)} /></div>)
}
function Num({ label, value, setValue, min, max, allowNegative }:
  { label:string, value:any, setValue:(n:number|null)=>void, min?:number, max?:number, allowNegative?:boolean }) {
  return (
    <div className="block">
      <label>{label}</label>
      <input className="input" inputMode="numeric" value={value ?? ''} onChange={e=>{
        const t = e.target.value
        if (t===''){ setValue(null); return }
        const n = Number(t); if (Number.isNaN(n)) return
        if (!allowNegative && n < 0) return
        if (min!=null && n<min) { setValue(min); return }
        if (max!=null && n>max) { setValue(max); return }
        setValue(n)
      }}/>
    </div>
  )
}
function Check({ label, checked, setChecked }:{ label:string, checked:boolean, setChecked:(v:boolean)=>void }) {
  return (
    <label className="check"><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/><span>{label}</span></label>
  )
}
function Select({ label, value, setValue, options, displayMap }:
  { label:string, value:any, setValue:(v:any)=>void, options:(string|number)[], displayMap?:Record<string,string> }) {
  return (
    <div className="block">
      <label>{label}</label>
      <select className="input" value={String(value ?? options[0])} onChange={e=>setValue(e.target.value)}>
        {options.map(o => <option key={String(o)} value={String(o)}>{displayMap?.[String(o)] ?? String(o)}</option>)}
      </select>
    </div>
  )
}
function Header({ title, subtitle }:{ title:string, subtitle:string }) {
  return (
    <div className="header">
      <div className="title">{title}<br/>{subtitle}</div>
      <div className="icons">
        <a className="icon" onClick={()=>navigator.clipboard.writeText(location.href)} title="URLコピー">⎘</a>
        <Authenticator variation="modal">
          {({ signOut, user }) => user
            ? <a className="icon" onClick={signOut} title="サインアウト">⇦</a>
            : <span />
          }
        </Authenticator>
      </div>
    </div>
  )
}
function NF(){ return <div className="page"><Header title="【JPFF East】" subtitle="Game Scorer"/><div className="card">ページが見つかりません。</div></div> }
function blankPlay(){ return {
  q:'1Q', time:'12:00', attackTeam:'home', fieldPos:'H', ballOn:null, toGo:null, down:1,
  gainYds:null, playType:'', fd:false, sack:false,
  passerNo:'', runnerNo:'', kickerNo:'',
  tacklerNo:'', tacklerNo2:'', interceptorNo:'',
  turnover:'-', penaltyY:null, remarks:'', scoreTeam:'-', scoreMethod:'-'
}}

// ===== Dark Styles =====
function Style(){
  return (<style>{`
:root { --bg:#0a0d12; --card:#121821; --fg:#eaf0f5; --muted:#9fb2c3; --pri:#0ea5a4; --danger:#c23636; }
*{ box-sizing:border-box; } 
html, body, #root { height:100%; background:var(--bg) !important; }
body{ margin:0; color:var(--fg); font:16px/1.6 "Meiryo UI","Segoe UI",system-ui; }

.page{ max-width:1100px; margin:0 auto; padding:16px; }
.header{ display:flex; justify-content:space-between; align-items:center; margin:8px 0 16px; }
.title{ font-weight:800; font-size:28px; line-height:1.2; }
.icons .icon{ display:inline-block; margin-left:10px; padding:8px 10px; background:#2b3746; color:#fff; border-radius:10px; cursor:pointer; }

.card{ background:var(--card); border-radius:16px; padding:16px; margin:12px 0; box-shadow:0 8px 24px rgba(0,0,0,.25); }
.row{ display:flex; align-items:center; } .between{ justify-content:space-between; } .gap{ gap:12px; }
.grid2{ display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.grid4{ display:grid; grid-template-columns:repeat(4,1fr); gap:12px; }
@media (max-width:860px){ .grid2{ grid-template-columns:1fr; } .grid4{ grid-template-columns:1fr 1fr; } .title{font-size:22px;} }

.block{ display:flex; flex-direction:column; gap:6px; }
.input{ width:100%; border:1px solid #324153; background:#0f141b; color:#fff; padding:10px 12px; border-radius:12px; }
.btn{ background:var(--pri); color:#fff; border:none; padding:12px 18px; border-radius:12px; cursor:pointer; font-weight:700; }
.btn.gray{ background:#2b3746; } .btn.danger{ background:var(--danger); }
.space{ height:12px; } .muted{ color:var(--muted); }

.miniTbl{ border-top:1px solid #2c3a4a; margin-top:10px; }
.miniTbl .row{ display:grid; grid-template-columns:60px 70px 70px 90px 50px 60px 1fr 60px 40px 70px; gap:8px; padding:6px 0; border-bottom:1px solid #203041; align-items:center; }
.miniTbl .head{ color:var(--muted); font-weight:700; }
.link{ color:#a7e0ff; background:none; border:none; cursor:pointer; text-decoration:underline; }

.tableWrap{ overflow:auto; }
table.table{ width:100%; border-collapse:collapse; background:#0f141b; }
table.table th, table.table td{ border-bottom:1px solid #233042; padding:8px 10px; text-align:left; }
table.table th{ color:var(--muted); font-weight:700; }

.footer{ display:flex; justify-content:center; gap:16px; }
.scoreTbl{ width:100%; border-collapse:collapse; background:#0f141b; }
.scoreTbl th, .scoreTbl td{ border-bottom:1px solid #263648; padding:6px 8px; text-align:center; }
.scoreTbl th:first-child, .scoreTbl td:first-child{ text-align:left; }

.check{ display:flex; align-items:center; gap:8px; }

/* Modal */
.modal{ position:fixed; inset:0; display:grid; place-items:center; background:rgba(0,0,0,.7); z-index:1000; }

/* Amplify UI をダークに塗りつぶし */
.amplify-authenticator, .amplify-card, .amplify-flex, .amplify-view {
  --amplify-colors-background-primary: #0a0d12;
  --amplify-colors-background-secondary: #121821;
  --amplify-colors-font-primary: #eaf0f5;
  --amplify-components-fieldcontrol-color: #eaf0f5;
  --amplify-components-button-primary-background-color: #0ea5a4;
  background:#0a0d12 !important;
  color:#eaf0f5 !important;
}
`}</style>)
}
