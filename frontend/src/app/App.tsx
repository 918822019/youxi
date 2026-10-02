import { useCallback, useEffect, useState } from 'react'
import type { AiDebug, GameCommand } from '../contracts/game'
import { MapCanvas } from '../map/MapCanvas'
import type { MapMode } from '../map/MapRenderer'
import { gameApi } from '../network/gameApi'
import { useGameStore } from '../stores/gameStore'
import { AiDebugPanel } from '../ui/AiDebugPanel'
import { CityPanel } from '../ui/CityPanel'
import { ReportsPanel } from '../ui/ReportsPanel'
import { ProductionPanel } from '../ui/ProductionPanel'
import { BattlePanel } from '../ui/BattlePanel'
import styles from './App.module.css'

export function App() {
  const view = useGameStore((state) => state.view)
  const selectedCityId = useGameStore((state) => state.selectedCityId)
  const setView = useGameStore((state) => state.setView)
  const selectCity = useGameStore((state) => state.selectCity)
  const [busy, setBusy] = useState(false)
  const [autoPlay, setAutoPlay] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [mapMode, setMapMode] = useState<MapMode>('political')
  const [error, setError] = useState<string | null>(null)
  const [archiveMessage, setArchiveMessage] = useState<string | null>(null)
  const [aiDebug, setAiDebug] = useState<AiDebug | null>(null)
  const selectedCity = view?.cities.find((city) => city.id === selectedCityId) ?? null
  const friendlyCities = view?.cities.filter((city) => city.owner === view.country) ?? []
  const hostileCities = view?.cities.filter((city) => city.owner !== view.country) ?? []
  const friendlyUnits = view?.units.filter((unit) => unit.owner === view.country) ?? []
  const latestReport = view?.reports.at(-1)

  const refreshDebug = useCallback(() => {
    if (import.meta.env.DEV) void gameApi.getAiDebug().then(setAiDebug).catch(() => setAiDebug(null))
  }, [])

  useEffect(() => {
    let active = true
    gameApi.getView().then((next) => { if (active) setView(next) })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : '加载失败') })
    refreshDebug()
    return () => { active = false }
  }, [setView, refreshDebug])

  const execute = useCallback(async (command?: GameCommand) => {
    if (busy || view?.winner) return
    setBusy(true)
    setError(null)
    try {
      setView(command ? await gameApi.submitCommand(command) : await gameApi.advanceDay())
      refreshDebug()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '请求失败')
      setAutoPlay(false)
    } finally {
      setBusy(false)
    }
  }, [busy, view?.winner, setView, refreshDebug])

  const archive = useCallback(async (action: 'save' | 'load' | 'reset') => {
    if (busy) return
    setAutoPlay(false)
    setBusy(true)
    setError(null)
    setArchiveMessage(null)
    try {
      if (action === 'save') {
        await gameApi.save()
        setArchiveMessage('战役已存档')
      } else {
        setView(action === 'load' ? await gameApi.load() : await gameApi.reset())
        refreshDebug()
        setArchiveMessage(action === 'load' ? '已读取战役存档' : '新战役已开始')
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '存档操作失败')
    } finally {
      setBusy(false)
    }
  }, [busy, setView, refreshDebug])

  useEffect(() => {
    if (view?.winner) setAutoPlay(false)
  }, [view?.winner])

  useEffect(() => {
    if (!autoPlay || !view || view.winner) return
    const timer = window.setInterval(() => { void execute() }, 1800 / speed)
    return () => window.clearInterval(timer)
  }, [autoPlay, speed, view, execute])

  return <main className={styles.layout}>
    <header className={styles.topbar}>
      <div className={styles.brand}><span className={styles.crest}>✦</span><div><span className={styles.eyebrow}>YOUXI / GRAND STRATEGY</span><strong>边境战区</strong></div></div>
      <div className={styles.resources} aria-label="国家态势">
        <div><small>国库储备</small><strong>◈ {view?.gold ?? '—'}</strong></div>
        <div><small>装备库存</small><strong>⚙ {view?.equipment ?? '—'}</strong></div>
        <div><small>补给库存</small><strong>▤ {view?.supplies ?? '—'}</strong></div>
        <div><small>控制地区</small><strong>{friendlyCities.length} <em>/ {view?.cities.length ?? '—'}</em></strong></div>
        <div><small>作战部队</small><strong>{friendlyUnits.length}</strong></div>
      </div>
      <div className={styles.timeControls}>
        <div className={styles.date}><small>战役时间</small><strong>第 {view?.turn ?? '—'} 日</strong></div>
        <button type="button" className={styles.playButton} disabled={!view || !!view.winner} onClick={() => setAutoPlay((value) => !value)} aria-label={autoPlay ? '暂停推进' : '自动推进'}>{autoPlay ? 'Ⅱ' : '▶'}</button>
        <button type="button" className={styles.dayButton} disabled={busy || !view || !!view.winner} onClick={() => void execute()}>+ 1 日</button>
        <button type="button" className={styles.speedButton} title="切换推进速度" onClick={() => setSpeed((value) => value % 3 + 1)}>{speed}×</button>
      </div>
    </header>
    {error && <div role="alert" className={styles.error}>{error} <button onClick={() => window.location.reload()}>重新连接</button></div>}
    <div className={styles.workspace}>
      <aside className={styles.leftRail} aria-label="国家指挥栏">
        <div className={styles.sectionHeading}><span>01 / 战略总览</span><span className={styles.tinyDot}>● LIVE</span></div>
        <div className={styles.overview}>
          <span className={styles.seal}>✦</span>
          <div><small>玩家阵营 · 国家指挥部</small><h2>西境同盟</h2><p>守住王都，夺取东港</p></div>
        </div>
        <div className={styles.sectionHeading}><span>02 / 工业生产</span><span>{view?.factories ?? '—'} 座工厂</span></div>
        <ProductionPanel view={view} busy={busy} onCommand={(command) => void execute(command)} />
        <div className={styles.sectionHeading}><span>03 / 陆军编制</span><span>{friendlyUnits.length} 支部队</span></div>
        <div className={styles.unitList}>
          {friendlyUnits.map((unit) => {
            const city = view?.cities.find((place) => place.id === unit.cityId)
            return <button type="button" className={`${styles.unitCard} ${selectedCityId === unit.cityId ? styles.activeUnit : ''}`} key={unit.id} onClick={() => selectCity(unit.cityId)}>
              <span className={styles.unitSymbol}>▣</span><span className={styles.unitMeta}><strong>{unit.name}</strong><small>{city?.name ?? '未知地区'} · {unit.order ? `${unit.order === 'attack' ? '进攻' : '调动'}中 / ${unit.daysRemaining + Math.max(0, unit.route.length - 1) * 2} 日` : '待命'}{unit.supplied === false ? ' · 断补给' : ''}</small></span><span className={styles.unitStrength}>{unit.strength ?? '?'}</span>
            </button>
          })}
          {friendlyUnits.length === 0 && <p className={styles.placeholder}>暂无可指挥的部队</p>}
        </div>
        <div className={styles.sectionHeading}><span>04 / 地区指挥</span><span>{selectedCity ? '已选定' : '未选定'}</span></div>
        <CityPanel city={selectedCity} view={view} busy={busy || !!view?.winner} onCommand={(command) => void execute(command)} />
      </aside>

      <section className={styles.mapArea} aria-label="战略地图">
        <MapCanvas cities={view?.cities ?? []} units={view?.units ?? []} selectedCityId={selectedCityId} mode={mapMode} enabled={!!view && !busy && !view.winner} onSelect={selectCity} onOrder={(command) => void execute(command)} />
        <div className={styles.mapTitle}><small>战区地图 / THE BORDER CAMPAIGN</small><strong>东部边境</strong><span>拖动部队至目标省份自动寻路 · 拖动空白处平移 · 滚轮缩放</span></div>
        <div className={styles.mapBadge}>✥ <span>当前战线</span><strong>{friendlyCities.length} : {hostileCities.length}</strong></div>
        <div className={styles.mapFooter}><div className={styles.legend}><span><i className={styles.ally} /> 西境同盟</span><span><i className={styles.enemy} /> 东境军</span><span><i className={styles.border} /> 交战边界</span></div>
          <div className={styles.modeSwitch}><button type="button" className={mapMode === 'political' ? styles.selectedMode : ''} onClick={() => setMapMode('political')}>政治</button><button type="button" className={mapMode === 'military' ? styles.selectedMode : ''} onClick={() => setMapMode('military')}>军势</button></div>
        </div>
        {view?.winner && <div className={styles.victory}><strong>{view.winner === view.country ? '战役胜利' : '战役失败'}</strong><span>全部地区已由{view.winner === view.country ? '我方' : '东境军'}控制</span></div>}
      </section>

      <aside className={styles.rightRail} aria-label="战况与奏报">
        <div className={styles.sectionHeading}><span>05 / 战区情报</span><span className={styles.alertDot}>● 实时</span></div>
        <div className={styles.intelPanel}><small>战场态势</small><strong>{selectedCity?.name ?? '东部边境'}</strong><p>{selectedCity ? selectedCity.description : '在战略地图上选择地区，查看驻军、地形概况与可执行命令。'}</p>
          <div className={styles.intelRow}><span>前线省份</span><b>{view?.cities.filter((city) => city.owner === view.country && city.neighbors.some((id) => view.cities.find((other) => other.id === id)?.owner !== view.country)).length ?? 0}</b></div>
          <div className={styles.intelRow}><span>补给线中断地区</span><b>{friendlyCities.filter((city) => !city.supplied).length}</b></div>
          <div className={styles.intelRow}><span>正在执行的军令</span><b>{friendlyUnits.filter((unit) => unit.order).length}</b></div>
        </div>
        <BattlePanel view={view} busy={busy} onCommand={(command) => void execute(command)} onSelect={selectCity} />
        <div className={styles.sectionHeading}><span>06 / 军令回执</span><span>{view?.commandResults.length ?? 0} 条</span></div>
        <div className={styles.feedback} role="status">{view?.commandResults.length ? view.commandResults.map((result, index) => <p key={index}><span className={result.accepted ? styles.accepted : styles.rejected}>{result.accepted ? '✓' : '×'}</span>{result.reason}</p>) : <p className={styles.placeholder}>等待指挥部下达军令…</p>}</div>
        <div className={styles.sectionHeading}><span>07 / 战役档案</span><span>本地单局</span></div>
        <div className={styles.archive}><button type="button" disabled={busy || !view} onClick={() => void archive('save')}>保存</button><button type="button" disabled={busy} onClick={() => void archive('load')}>读取</button><button type="button" disabled={busy} onClick={() => void archive('reset')}>重开</button></div>
        {archiveMessage && <p className={styles.archiveMessage} role="status">{archiveMessage}</p>}
        <ReportsPanel reports={view?.reports ?? []} />
        {aiDebug && <AiDebugPanel debug={aiDebug} />}
      </aside>
    </div>
    <footer className={styles.statusBar}><span><i /> 战略态势系统 / ONLINE</span><span>最新奏报：{latestReport?.text ?? '等待战场数据…'}</span><span>第 {view?.turn ?? '—'} 日 · {autoPlay ? `${speed}× 运行中` : '已暂停'}</span></footer>
  </main>
}
