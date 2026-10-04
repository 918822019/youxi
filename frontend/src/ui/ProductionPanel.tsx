import type { GameCommand, PlayerView } from '../contracts/game'
import { IconGear, IconSupply } from './icons'
import styles from './ProductionPanel.module.css'

interface Props {
  view: PlayerView | null
  busy: boolean
  onCommand: (command: GameCommand) => void
}

export function ProductionPanel({ view, busy, onCommand }: Props) {
  return <section className={styles.panel} aria-label="工业生产">
    <div className={styles.summary}><span>可用工厂 <b>{view?.factories ?? '—'}</b></span><span>投入方向 <b>{view?.production === 'supplies' ? '补给' : '装备'}</b></span></div>
    <div className={styles.options}>
      <button type="button" disabled={busy || !view || !!view.winner || view.production === 'equipment'} onClick={() => onCommand({ type: 'set_production', focus: 'equipment' })}><IconGear /> 生产装备</button>
      <button type="button" disabled={busy || !view || !!view.winner || view.production === 'supplies'} onClick={() => onCommand({ type: 'set_production', focus: 'supplies' })}><IconSupply /> 生产补给</button>
    </div>
    <p>连通工厂每天产出；补给被部队逐日消耗，断补给会造成减员。</p>
  </section>
}
