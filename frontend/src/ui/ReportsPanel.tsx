import type { Report } from '../contracts/game'
import styles from './Panels.module.css'

export function ReportsPanel({ reports }: { reports: Report[] }) {
  return <section className={styles.reportsPanel} aria-label="战地奏报">
    <div className={styles.sectionHeading}><span>08 / 战地奏报</span><span>{reports.length} 条</span></div>
    <ul className={styles.reports}>{[...reports].reverse().map((report) =>
      <li key={report.id}><small>第 {String(report.turn).padStart(2, '0')} 日 <span>●</span> 战地来报</small><p>{report.text}</p></li>
    )}</ul>
  </section>
}
