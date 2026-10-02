import type { AiDebug } from '../contracts/game'
import styles from './Panels.module.css'

export function AiDebugPanel({ debug }: { debug: AiDebug }) {
  return <section className={styles.panel} aria-label="AI 调试面板">
    <h2>AI 调试 · 东境</h2>
    <p>观察：第 {debug.observation?.turn ?? '—'} 日，国库 {debug.observation?.gold ?? '—'} 金；
      {debug.observation?.units.filter((unit) => unit.owner === 'rival').map((unit) => `${unit.name} ${unit.strength} 人 @ ${unit.cityId}`).join('、') || '无可用部队'}</p>
    <p>计划：{debug.plan}</p>
    <p>命令：{debug.commands.map((command) => `${command.type} ${command.cityId ?? command.unitId ?? ''} ${command.targetId ?? ''}`).join('、') || '尚未决策'}</p>
    <ul className={styles.reports}>{debug.results.map((result, index) => <li key={index}>{result.accepted ? '已接受' : '已拒绝'}：{result.reason}</li>)}</ul>
    <p>执行中：{debug.currentOrders.filter((unit) => unit.order).map((unit) => `${unit.name} → ${unit.targetId}（${unit.daysRemaining} 日）`).join('、') || '无'}</p>
  </section>
}
