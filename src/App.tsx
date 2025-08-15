import { useEffect, useState } from 'react'
import { withAuthenticator, type WithAuthenticatorProps } from '@aws-amplify/ui-react'
import '@aws-amplify/ui-react/styles.css'

import { generateClient } from 'aws-amplify/data'
import type { Schema } from '../amplify/data/resource'

const client = generateClient<Schema>()

function App({ signOut, user }: WithAuthenticatorProps) {
  const [teams, setTeams] = useState<Schema['Team']['type'][]>([])
  const [games, setGames] = useState<Schema['Game']['type'][]>([])

  async function load() {
    const t = await client.models.Team.list({ authMode: 'userPool' })
    setTeams(t.data)
    const g = await client.models.Game.list({ limit: 500, authMode: 'userPool' })
    setGames(g.data)
  }
  useEffect(() => { void load() }, [])

  // ---------- CSV 出力（型を厳密化） ----------
  function downloadCSV() {
    const headers: string[] = [
      'date','venue','home','away',
      'q1H','q1A','q2H','q2A','q3H','q3A','q4H','q4A',
      'otH','otA','finalH','finalA','notes'
    ]
    const n = (v?: number | null) => String(v ?? 0)
    const s = (v?: string | null) => String(v ?? '')

    const rows: string[][] = games.map(g => {
      const home = teams.find(t => t.id === g.homeTeamID)?.name ?? ''
      const away = teams.find(t => t.id === g.awayTeamID)?.name ?? ''
      const finalH = (g.finalHome ?? (
        (g.q1Home ?? 0)+(g.q2Home ?? 0)+(g.q3Home ?? 0)+(g.q4Home ?? 0)+(g.otHome ?? 0)
      ))
      const finalA = (g.finalAway ?? (
        (g.q1Away ?? 0)+(g.q2Away ?? 0)+(g.q3Away ?? 0)+(g.q4Away ?? 0)+(g.otAway ?? 0)
      ))

      return [
        s(g.date), s(g.venue), home, away,
        n(g.q1Home), n(g.q1Away),
        n(g.q2Home), n(g.q2Away),
        n(g.q3Home), n(g.q3Away),
        n(g.q4Home), n(g.q4Away),
        n(g.otHome), n(g.otAway),
        n(finalH), n(finalA),
        s(g.notes).replaceAll('\n',' ')
      ]
    })

    const csv = [headers, ...rows].map(line => line.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `jpff_games_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }
  // -------------------------------------------

  return (
    <div style={{maxWidth:900, margin:'0 auto', padding:16}}>
      <header style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
        <h1>JPFF Game Scorer</h1>
        <div>
          <span style={{marginRight:12}}>{user?.username}</span>
          <button onClick={signOut}>Sign out</button>
        </div>
      </header>

      <TeamQuickAdd onAdded={load} />
      <GameQuickAdd teams={teams} onAdded={load} />

      <section>
        <h2>試合一覧</h2>
        <button onClick={downloadCSV}>CSV出力</button>
        <table style={{width:'100%', marginTop:8, borderCollapse:'collapse'}}>
          <thead>
            <tr><th>Date</th><th>Home</th><th>Away</th><th>Score</th><th>Venue</th></tr>
          </thead>
          <tbody>
            {games.map(g=>{
              const home = teams.find(t=>t.id===g.homeTeamID)?.name ?? ''
              const away = teams.find(t=>t.id===g.awayTeamID)?.name ?? ''
              const h = (g.finalHome ?? ((g.q1Home ?? 0)+(g.q2Home ?? 0)+(g.q3Home ?? 0)+(g.q4Home ?? 0)+(g.otHome ?? 0)))
              const a = (g.finalAway ?? ((g.q1Away ?? 0)+(g.q2Away ?? 0)+(g.q3Away ?? 0)+(g.q4Away ?? 0)+(g.otAway ?? 0)))
              return (
                <tr key={g.id}>
                  <td>{g.date}</td>
                  <td>{home}</td>
                  <td>{away}</td>
                  <td>{h} - {a}</td>
                  <td>{g.venue ?? ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>
    </div>
  )
}

function TeamQuickAdd({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState('')
  const [division, setDivision] = useState('')

  async function add() {
    if (name.trim() === '') return
    await client.models.Team.create(
      { name, division } as any,                // ★ 型を any に
      { authMode: 'userPool' }
    )
    setName(''); setDivision(''); onAdded()
  }
  

  return (
    <section style={{margin:'16px 0'}}>
      <h2>チーム登録（簡易）</h2>
      <input placeholder="Team name" value={name} onChange={e=>setName(e.target.value)} />
      <input placeholder="Division(任意)" value={division} onChange={e=>setDivision(e.target.value)} style={{marginLeft:8}}/>
      <button onClick={add} style={{marginLeft:8}}>追加</button>
    </section>
  )
}

function GameQuickAdd(
  { teams, onAdded }: { teams: Schema['Team']['type'][]; onAdded: () => void }
) {
  const today = new Date().toISOString().slice(0,10)
  const [date, setDate] = useState<string>(today)
  const [venue, setVenue] = useState<string>('')
  const [homeTeamID, setHomeTeamID] = useState<string>('')
  const [awayTeamID, setAwayTeamID] = useState<string>('')
  const [q, setQ] = useState({q1H:0,q1A:0,q2H:0,q2A:0,q3H:0,q3A:0,q4H:0,q4A:0,otH:0,otA:0})

  function step(key: keyof typeof q, d: number) {
    setQ(prev => ({ ...prev, [key]: Math.max(0, (prev[key] as number) + d) }))
  }

  async function add() {
    if (!date || !homeTeamID || !awayTeamID) return
    const input = {
      date, venue, homeTeamID, awayTeamID,
      q1Home: q.q1H, q1Away: q.q1A,
      q2Home: q.q2H, q2Away: q.q2A,
      q3Home: q.q3H, q3Away: q.q3A,
      q4Home: q.q4H, q4Away: q.q4A,
      otHome: q.otH, otAway: q.otA
    } as any                                  // ★ ここも any
    await client.models.Game.create(input, { authMode: 'userPool' })
    setVenue(''); setHomeTeamID(''); setAwayTeamID('')
    setQ({q1H:0,q1A:0,q2H:0,q2A:0,q3H:0,q3A:0,q4H:0,q4A:0,otH:0,otA:0})
    onAdded()
  }
  

  const pairs = [
    ['Q1 Home','q1H'],['Q1 Away','q1A'],
    ['Q2 Home','q2H'],['Q2 Away','q2A'],
    ['Q3 Home','q3H'],['Q3 Away','q3A'],
    ['Q4 Home','q4H'],['Q4 Away','q4A'],
    ['OT Home','otH'],['OT Away','otA'],
  ] as const

  return (
    <section style={{margin:'16px 0'}}>
      <h2>試合入力（最小）</h2>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8, maxWidth:640}}>
        <div><label>日付</label><br/><input type="date" value={date} onChange={e=>setDate(e.target.value)} /></div>
        <div><label>会場（任意）</label><br/><input value={venue} onChange={e=>setVenue(e.target.value)} /></div>
        <div><label>Home</label><br/>
          <select value={homeTeamID} onChange={e=>setHomeTeamID(e.target.value)}>
            <option value="">選択</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div><label>Away</label><br/>
          <select value={awayTeamID} onChange={e=>setAwayTeamID(e.target.value)}>
            <option value="">選択</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:8, marginTop:8}}>
        {pairs.map(([label,key])=>(
          <div key={key}>
            <label>{label}</label><br/>
            <button onClick={()=>step(key as any,-1)}>-</button>
            <span style={{margin:'0 8px'}}>{(q as any)[key]}</span>
            <button onClick={()=>step(key as any, 1)}>+</button>
          </div>
        ))}
      </div>

      <button onClick={add} style={{marginTop:8}}>保存</button>
    </section>
  )
}

export default withAuthenticator(App)
