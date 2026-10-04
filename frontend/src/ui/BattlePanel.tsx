import type { GameCommand, PlayerView } from '../contracts/game'
import { IconRoute, IconSword } from './icons'
import styles from './BattlePanel.module.css'

interface Props {
  view: PlayerView | null
  busy: boolean
  onCommand: (command: GameCommand) => void
  onSelect: (cityId: string) => void
}

export function BattlePanel({ view, busy, onCommand, onSelect }: Props) {
  const active = view?.units.filter((unit) => unit.owner === view.country && unit.order) ?? []
  const battles = view?.reports.filter((report) => /攻占|进攻.*失败|失守|路线被切断/.test(report.text)).slice(-3).reverse() ?? []
  const names = new Map(view?.cities.map((city) => [city.id, city.name]))
  return <section className={styles.panel} aria-label="战斗指挥">
    <div className={styles.heading}><span>战斗指挥 / OPERATIONS</span><b>{active.length} 道执行中</b></div>
    {active.length ? active.map((unit) => <article className={styles.card} key={unit.id}>
      <div className={styles.cardTitle}><strong>{unit.name}</strong><span>{unit.order === 'attack' ? <><IconSword /> 进攻</> : <><IconRoute /> 调动</>}</span></div>
      <div className={styles.meta}>{names.get(unit.cityId)} → {names.get(unit.targetId ?? '') ?? '未知'} · {unit.strength ?? '?'} 人</div>
      <div className={styles.route} aria-label={`${unit.name}行军路线`}>
        {[unit.cityId, ...unit.route].map((id, index) => <span key={`${id}-${index}`} className={index === 0 ? styles.origin : ''}>{names.get(id) ?? id}</span>)}
      </div>
      <div className={styles.meta}>本段剩余 {unit.daysRemaining} 日 · 预计抵达 {unit.daysRemaining + Math.max(0, unit.route.length - 1) * 2} 日
        {unit.supplied === false && <span className={styles.warning}> · 断补给</span>}
      </div>
      <div className={styles.actions}><button type="button" onClick={() => onSelect(unit.cityId)}>定位 / 改令</button><button type="button" disabled={busy} onClick={() => onCommand({ type: 'cancel_order', unitId: unit.id })}>取消军令</button></div>
    </article>) : <p className={styles.empty}>暂无执行中的军令。拖动地图上的我方部队，或从地区指挥下令。</p>}
    {battles.length > 0 && <div className={styles.battleLog}><strong>最近战报</strong>{battles.map((report) => <p key={report.id}>第 {report.turn} 日 · {report.text}</p>)}</div>}
  </section>
}
