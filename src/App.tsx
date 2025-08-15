/* eslint-disable @typescript-eslint/no-explicit-any */
// JPFF Game Scorer - Lite (no backend, local-only, CSV exporter)
//
// 目的:
// - サインイン不要 / バックエンド不要
// - 1プレーずつ入力して一覧に追加
// - 一覧をテンプレCSVに近い形でダウンロード
//
// 使い方:
// 1) 画面上部で「日付/会場/ホーム/ビジター」を入力
// 2) 下のフォームでプレー情報を入れて「1行追加」
// 3) 必要行を入れ終えたら「CSV出力」
//
// 保存:
// - 入力中の試合情報とプレー一覧は localStorage に自動保存・自動復元

import React, { useEffect, useMemo, useState } from 'react'

export default function App() {
  return (
    <>
      <GlobalStyle />
      <LiteScorer />
    </>
  )
}

/* ============================ 型とユーティリティ ============================ */

type TeamSide = 'home' | 'visitor'
type FieldPos = 'H' | 'V'
type Quarter = '1Q' | '2Q' | '3Q' | '4Q' | 'OT'
type PlayType =
  | 'R' // Run
  | 'P' // Pass
  | 'K' // Kick (KO/Punt/FGの総称)
  | 'FG'
  | 'KO'
  | 'PU'
  | 'PE' // Penalty
  | 'SP' // Spike/Knee down
  | 'TO' // Time out
  | 'SF' // Safety
  | '-'  // なし

type PlayRow = {
  id: string
  createdAt: string
  q: Quarter
  time: string
  attackTeam: TeamSide
  fieldPos: FieldPos
  ballOn: number | null
  toGo: number | null
  down: 1 | 2 | 3 | 4
  gainYds: number | null
  playType: PlayType
  fd: boolean
  sack: boolean
  passerNo?: string
  runnerNo?: string
  kickerNo?: string
  tacklerNo?: string
  tacklerNo2?: string
  interceptorNo?: string
  turnover?: '-' | 'Intercept' | 'Fumble' | '4th down失敗' | 'Safety'
  penaltyY?: number | null
  remarks?: string
  scoreTeam?: '-' | TeamSide
  scoreMethod?: '-' | 'TD' | 'FG' | 'Safety' | 'TFP(Kick)' | 'TFP(Run)' | 'TFP(Pass)'
}

const isNum = (v: any) => v !== null && v !== undefined && v !== '' && !isNaN(Number(v))
const to2 = (n: number) => (n < 10 ? `0${n}` : `${n}`)
const uid = () => Math.random().toString(36).slice(2)

/* ============================ ルート画面 ============================ */

function LiteScorer() {
  // 試合メタ
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [venue, setVenue] = useState('')
  const [home, setHome] = useState('Home')
  const [visitor, setVisitor] = useState('Visitor')

  // 入力中のプレー
  const [p, setP] = useState<PlayRow>(emptyPlay())

  // 追加済みプレー一覧
  const [plays, setPlays] = useState<PlayRow[]>([])

  // localStorage キー
  const KEY = 'jpff-lite:state'

  // 復元
  useEffect(() => {
    try {
      const json = localStorage.getItem(KEY)
      if (!json) return
      const parsed = JSON.parse(json)
      setDate(parsed.date ?? date)
      setVenue(parsed.venue ?? '')
      setHome(parsed.home ?? 'Home')
      setVisitor(parsed.visitor ?? 'Visitor')
      setPlays(parsed.plays ?? [])
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 保存
  useEffect(() => {
    const state = { date, venue, home, visitor, plays }
    localStorage.setItem(KEY, JSON.stringify(state))
  }, [date, venue, home, visitor, plays])

  // 自動FDヒント
  const fdHint = useMemo(() => isNum(p.gainYds) && isNum(p.toGo) && Number(p.gainYds) >= Number(p.toGo), [p.gainYds, p.toGo])

  // 獲得Yds → BALL ON 自動更新（攻撃系）
  useEffect(() => {
    if (!isNum(p.ballOn) || !isNum(p.gainYds)) return
    if (!['R', 'P', 'PE', 'SP'].includes(p.playType)) return
    const sign = p.fieldPos === 'H' ? 1 : -1
    let next = Number(p.ballOn) + sign * Number(p.gainYds)
    next = Math.max(1, Math.min(50, next))
    setP(s => ({ ...s, ballOn: next }))
  }, [p.gainYds]) // eslint-disable-line

  // キック系 → 自動初期化
  useEffect(() => {
    if (['KO', 'PU', 'FG', 'K'].includes(p.playType)) {
      setP(s => ({ ...s, down: 1, toGo: 10, fd: false }))
    }
  }, [p.playType])

  const addRow = () => {
    const row: PlayRow = { ...p, id: uid(), createdAt: new Date().toISOString() }
    setPlays(prev => [...prev, row])
    setP(emptyPlay()) // フォーム初期化
  }

  const removeRow = (id: string) => setPlays(prev => prev.filter(r => r.id !== id))
  const editRow = (row: PlayRow) => setP({ ...row })

  const clearAll = () => {
    if (!confirm('すべての行を削除します。よろしいですか？')) return
    setPlays([])
  }

  const downloadCSV = () => {
    // できるだけ添付シートの列構成に寄せた見出し
    const header = [
      'Q', '時刻', '攻撃TEAM', 'BALL ON', 'DOWNS', 'TO GO',
      'PLAYS', '獲得Y', 'FD', 'QB/PASSE', 'RB/WR/KICKER',
      'TACKLE BY', 'TACKLE BY(2)', 'INT/PD', 'TURNOVER', '罰則Y',
      'REMARKS', '得点チーム(H/V)', '得点方法'
    ]
    const rows = plays.map(r => {
      const team = r.attackTeam === 'home' ? home : visitor
      const ballOn = `${r.fieldPos}${isNum(r.ballOn) ? r.ballOn : ''}`
      const playsCode =
        r.playType === 'R' ? 'R'
          : r.playType === 'P' ? 'P'
          : r.playType === 'K' ? 'K'
          : r.playType
      const scoreTeam = r.scoreTeam === 'home' ? 'H' : r.scoreTeam === 'visitor' ? 'V' : ''
      return [
        r.q,
        r.time,
        team,
        ballOn,
        r.down ?? '',
        r.toGo ?? '',
        playsCode,
        r.gainYds ?? '',
        r.fd ? '○' : '',
        r.passerNo ?? '',
        r.kickerNo ?? '',
        r.tacklerNo ?? '',
        r.tacklerNo2 ?? '',
        r.interceptorNo ?? '',
        r.turnover ?? '',
        r.penaltyY ?? '',
        r.remarks ?? '',
        scoreTeam,
        r.scoreMethod ?? ''
      ]
    })

    const metaTop = [
      ['試合日', date, '', '会場', venue],
      ['ホームチーム名', home, '', 'ビジターチーム名', visitor],
      ['1Q/2Q/3Q/4Q/OT', '', '', '', ''] // 余白
    ].map(r => r.map(s => `"${(s ?? '').toString().replace(/"/g, '""')}"`).join(',')).join('\r\n')

    const csv = [
      metaTop,
      header.map(s => `"${s}"`).join(','),
      ...rows.map(r => r.map(s => `"${(s ?? '').toString().replace(/"/g, '""')}"`).join(','))
    ].join('\r\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `jpff_plays_${date.replaceAll('-', '')}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  // 簡易スコア（得点方法→点数換算）
  const board = useMemo(() => {
    const blank = { Q1: 0, Q2: 0, Q3: 0, Q4: 0, Total: 0 }
    const H = { ...blank }, V = { ...blank }
    const pt = (m?: string) =>
      m === 'TD' ? 6 : m === 'FG' ? 3 : m === 'Safety' ? 2
        : m === 'TFP(Kick)' ? 1 : (m === 'TFP(Run)' || m === 'TFP(Pass)') ? 2 : 0
    plays.forEach(p => {
      const qKey = ({ '1Q': 'Q1', '2Q': 'Q2', '3Q': 'Q3', '4Q': 'Q4' } as any)[p.q] || 'Q1'
      const s = pt(p.scoreMethod)
      if (!s || p.scoreTeam === '-' || !p.scoreTeam) return
      const tgt = p.scoreTeam === 'home' ? H : V
      ;(tgt as any)[qKey] += s
      tgt.Total += s
    })
    return { H, V }
  }, [plays])

  return (
    <div className="page">
      <Header title="【JPFF East】" subtitle="Game Scorer - Lite（オフラインCSV）" />

      {/* 試合情報 */}
      <div className="card">
        <h2>試合情報</h2>
        <div className="grid2">
          <Input label="試合日" type="date" value={date} onChange={setDate} />
          <Input label="会場" value={venue} onChange={setVenue} />
          <Input label="ホーム" value={home} onChange={setHome} />
          <Input label="ビジター" value={visitor} onChange={setVisitor} />
        </div>
      </div>

      {/* スコアボード（参考） */}
      <div className="score card">
        <table className="scoreTbl">
          <thead><tr><th></th><th>1Q</th><th>2Q</th><th>3Q</th><th>4Q</th><th>Total</th></tr></thead>
        <tbody>
          <tr><th>{home}</th><td>{board.H.Q1}</td><td>{board.H.Q2}</td><td>{board.H.Q3}</td><td>{board.H.Q4}</td><td>{board.H.Total}</td></tr>
          <tr><th>{visitor}</th><td>{board.V.Q1}</td><td>{board.V.Q2}</td><td>{board.V.Q3}</td><td>{board.V.Q4}</td><td>{board.V.Total}</td></tr>
        </tbody>
        </table>
      </div>

      {/* 入力フォーム */}
      <div className="card">
        <h2>プレー入力</h2>

        <div className="grid4">
          <Block label="Q">
            <Seg
              value={p.q}
              setValue={(v: Quarter) => setP({ ...p, q: v })}
              options={['1Q', '2Q', '3Q', '4Q', 'OT']}
            />
          </Block>

          <Input label="試合時間" type="time" value={p.time} onChange={v => setP({ ...p, time: v })} />
          <Block label="Field pos">
            <Seg
              value={p.fieldPos}
              setValue={(v: FieldPos) => setP({ ...p, fieldPos: v })}
              options={['H', 'V']}
              display={{ H: '自陣 (H)', V: '敵陣 (V)' }}
            />
          </Block>
          <Block label="攻撃">
            <Seg
              value={p.attackTeam}
              setValue={(v: TeamSide) => setP({ ...p, attackTeam: v })}
              options={['home', 'visitor']}
              display={{ home: 'ホーム', visitor: 'ビジター' }}
            />
          </Block>

          <NumInput label="BALL ON (1-50)" value={p.ballOn} setValue={n => setP({ ...p, ballOn: n })} min={1} max={50} />
          <NumInput label="TO GO (1-50)" value={p.toGo} setValue={n => setP({ ...p, toGo: n })} min={1} max={50} />

          <Block label="DOWN">
            <Seg
              value={p.down}
              setValue={(v: 1|2|3|4) => setP({ ...p, down: v })}
              options={[1,2,3,4]}
            />
          </Block>

          <NumInput label="獲得Yds（負もOK）" value={p.gainYds} setValue={n => setP({ ...p, gainYds: n })} allowNegative />
        </div>

        <Block label="PLAYS（どれか1つ）">
          <Seg value={p.playType} setValue={(v: PlayType) => setP({ ...p, playType: v })}
               options={['R','P','K','KO','PU','FG','PE','SP','TO','SF','-']}
               display={{ R:'R', P:'P', K:'K', KO:'KO', PU:'Punt', FG:'FG', PE:'Penalty', SP:'Spike/Knee', TO:'Time out', SF:'Safety', '-':'-' }} />
        </Block>

        <div className="grid2">
          <Block label="フラグ">
            <div className="seg">
              <button className={`chip ${p.fd ? 'on': ''}`} onClick={()=>setP({...p, fd: !p.fd})}>First down 獲得</button>
              <button className={`chip ${p.sack ? 'on': ''}`} onClick={()=>setP({...p, sack: !p.sack})}>Sack</button>
            </div>
            {fdHint && <small className="muted">Yds ≥ TG のため FD 推奨</small>}
          </Block>
          <div />
        </div>

        <div className="grid4">
          <Input label="QB/PASSE #" value={p.passerNo ?? ''} onChange={v => setP({ ...p, passerNo: v })} />
          <Input label="RB/WR/KICKER #" value={p.kickerNo ?? ''} onChange={v => setP({ ...p, kickerNo: v })} />
          <Input label="TACKLE BY #" value={p.tacklerNo ?? ''} onChange={v => setP({ ...p, tacklerNo: v })} />
          <Input label="TACKLE BY(2) #" value={p.tacklerNo2 ?? ''} onChange={v => setP({ ...p, tacklerNo2: v })} />
          <Input label="INT/PD #" value={p.interceptorNo ?? ''} onChange={v => setP({ ...p, interceptorNo: v })} />
          <Select label="TURNOVER" value={p.turnover ?? '-'} onChange={v => setP({ ...p, turnover: v as any })}
                  options={['-','Intercept','Fumble','4th down失敗','Safety']} />
          <NumInput label="罰則Y" value={p.penaltyY ?? null} setValue={n => setP({ ...p, penaltyY: n })} allowNegative={false} />
          <Input label="REMARKS" value={p.remarks ?? ''} onChange={v => setP({ ...p, remarks: v })} />
        </div>

        <div className="grid2">
          <Select label="得点チーム" value={p.scoreTeam ?? '-'} onChange={v => setP({ ...p, scoreTeam: v as any })}
                  options={['-','home','visitor']} display={{'-':'-','home':`${home}(H)`,'visitor':`${visitor}(V)`}} />
          <Select label="得点方法" value={p.scoreMethod ?? '-'} onChange={v => setP({ ...p, scoreMethod: v as any })}
                  options={['-','TD','FG','Safety','TFP(Kick)','TFP(Run)','TFP(Pass)']} />
        </div>

        <div className="row gap">
          <button className="btn" onClick={addRow}>1行追加</button>
          <button className="btn white" onClick={() => setP(emptyPlay())}>入力リセット</button>
          <button className="btn gray" onClick={clearAll}>一覧を全削除</button>
        </div>
      </div>

      {/* 一覧 */}
      <div className="card">
        <h3>プレー一覧（最新が下）</h3>
        <div className="tableWrap">
          <table className="table">
            <thead>
            <tr>
              <th>Q</th><th>時計</th><th>攻撃</th><th>位置</th><th>DN</th><th>TG</th>
              <th>PLAYS</th><th>Yds</th><th>FD</th><th>備考</th><th></th>
            </tr>
            </thead>
            <tbody>
            {plays.map(row => (
              <tr key={row.id}>
                <td>{row.q}</td>
                <td>{row.time}</td>
                <td>{row.attackTeam === 'home' ? home : visitor}</td>
                <td>{row.fieldPos}{row.ballOn ?? ''}</td>
                <td>{row.down}</td>
                <td>{row.toGo ?? ''}</td>
                <td>{row.playType}{row.sack ? ' (Sack)' : ''}</td>
                <td>{row.gainYds ?? ''}</td>
                <td>{row.fd ? '○' : ''}</td>
                <td>{row.remarks ?? ''}</td>
                <td>
                  <button className="link" onClick={() => editRow(row)}>編集</button>
                  {' / '}
                  <button className="link" onClick={() => removeRow(row.id)}>削除</button>
                </td>
              </tr>
            ))}
            </tbody>
          </table>
        </div>

        <div className="space" />
        <div className="row gap">
          <button className="btn gray" onClick={downloadCSV}>CSV出力</button>
        </div>
      </div>
    </div>
  )
}

/* ============================ UIコンポーネント ============================ */

function Header({ title, subtitle }: { title: string, subtitle: string }) {
  return (
    <div className="header">
      <div className="title">{title}<br />{subtitle}</div>
      <div className="icons">
        <a className="icon" onClick={() => navigator.clipboard.writeText(location.href)} title="URLコピー">⎘</a>
      </div>
    </div>
  )
}

function Input({ label, value, onChange, type }: { label: string, value: string, onChange: (v: string)=>void, type?: string }) {
  return (
    <div className="block">
      <label>{label}</label>
      <input className="input" value={value} type={type ?? 'text'} onChange={e => onChange(e.target.value)} />
    </div>
  )
}

function NumInput({ label, value, setValue, min, max, allowNegative }:{
  label: string, value: number|null, setValue:(n:number|null)=>void, min?:number, max?:number, allowNegative?:boolean
}) {
  return (
    <div className="block">
      <label>{label}</label>
      <input className="input" inputMode="numeric" pattern="[0-9]*" value={value ?? ''} onChange={e=>{
        const t = e.target.value
        if (t === '') { setValue(null); return }
        const n = Number(t)
        if (Number.isNaN(n)) return
        if (!allowNegative && n < 0) return
        if (min != null && n < min) { setValue(min); return }
        if (max != null && n > max) { setValue(max); return }
        setValue(n)
      }} />
    </div>
  )
}

function Select({ label, value, onChange, options, display }:{
  label: string, value: string, onChange:(v:string)=>void, options:string[], display?:Record<string,string>
}) {
  return (
    <div className="block">
      <label>{label}</label>
      <select className="input" value={value} onChange={e => onChange(e.target.value)}>
        {options.map(o => <option key={o} value={o}>{display?.[o] ?? o}</option>)}
      </select>
    </div>
  )
}

function Block({ label, children }:{ label:string, children: React.ReactNode }) {
  return <div className="block"><label>{label}</label>{children}</div>
}

function Seg<T extends string | number>({ value, setValue, options, display }:{
  value: T, setValue:(v:T)=>void, options: readonly T[] | T[], display?: Record<string,string>
}) {
  return (
    <div className="seg">
      {options.map((o:any) =>
        <button key={String(o)} className={`chip ${value === o ? 'on' : ''}`} onClick={()=>setValue(o)}>
          {display?.[String(o)] ?? String(o)}
        </button>
      )}
    </div>
  )
}

/* ============================ 初期値 ============================ */

function emptyPlay(): PlayRow {
  return {
    id: '',
    createdAt: '',
    q: '1Q',
    time: '12:00',
    attackTeam: 'home',
    fieldPos: 'H',
    ballOn: null,
    toGo: null,
    down: 1,
    gainYds: null,
    playType: '-',
    fd: false,
    sack: false,
    passerNo: '',
    runnerNo: '',
    kickerNo: '',
    tacklerNo: '',
    tacklerNo2: '',
    interceptorNo: '',
    turnover: '-',
    penaltyY: null,
    remarks: '',
    scoreTeam: '-',
    scoreMethod: '-',
  }
}

/* ============================ スタイル ============================ */

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
h2{ margin:0 0 10px; }
.row{ display:flex; align-items:center; }
.gap{ gap:12px; }
.grid2{ display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.grid4{ display:grid; grid-template-columns:repeat(4,1fr); gap:12px; }
@media (max-width:860px){ .grid4{ grid-template-columns:1fr 1fr; } .grid2{ grid-template-columns:1fr; } .title{font-size:22px;} }
.block{ display:flex; flex-direction:column; gap:6px; }
label{ color:var(--muted); font-size:14px; }
.input{ width:100%; border:1px solid #324153; background:#0f141b; color:#fff; padding:10px 12px; border-radius:12px; }
.btn{ background:var(--pri); color:#fff; border:none; padding:12px 18px; border-radius:12px; cursor:pointer; font-weight:700; }
.btn.white{ background:#fff; color:#000; }
.btn.gray{ background:#2b3746; }
.tableWrap{ overflow:auto; }
table.table{ width:100%; border-collapse:collapse; }
table.table th, table.table td{ border-bottom:1px solid #233042; padding:8px 10px; text-align:left; white-space:nowrap; }
table.table th{ color:var(--muted); font-weight:700; }
.space{ height:12px; }
.muted{ color:var(--muted); }
.seg{ display:flex; flex-wrap:wrap; gap:8px; }
.chip{ background:var(--chip); color:#fff; padding:8px 12px; border:1px solid #314052; border-radius:999px; }
.chip.on{ background:var(--chipOn); border-color:transparent; }
.link{ color:#a7e0ff; background:none; border:none; cursor:pointer; text-decoration:underline; }
.scoreTbl{ width:100%; border-collapse:collapse; }
.scoreTbl th, .scoreTbl td{ border-bottom:1px solid #263648; padding:6px 8px; text-align:center; }
.scoreTbl th:first-child, .scoreTbl td:first-child{ text-align:left; }
`}</style>
  )
}
