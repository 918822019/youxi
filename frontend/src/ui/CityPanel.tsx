import { useState } from 'react'
import type { CityView, GameCommand, PlayerView } from '../contracts/game'
import { IconTarget } from './icons'
import styles from './Panels.module.css'

interface Props {
  city: CityView | null
  view: PlayerView | null
  busy: boolean
  onCommand: (command: GameCommand) => void
}

export function CityPanel({ city, view, busy, onCommand }: Props) {
  const [choice, setChoice] = useState<{ cityId: string; unitId: string; targetId: string } | null>(null)
  const own = city?.owner === view?.country
  const stationed = view?.units.filter((unit) => unit.cityId === city?.id) ?? []
  const ownUnits = stationed.filter((unit) => unit.owner === view?.country)
  const recruitable = ownUnits.find((unit) => !unit.order)
  const chosenUnit = ownUnits.find((unit) => unit.id === choice?.unitId && city?.id === choice.cityId) ?? ownUnits[0]
  const targetId = choice && city && chosenUnit && choice.cityId === city.id && choice.unitId === chosenUnit.id ? choice.targetId : chosenUnit?.targetId
  const chosenTarget = view?.cities.find((target) => target.id === targetId && target.id !== city?.id)
  const opponent = chosenTarget && chosenTarget.owner !== view?.country
  const knownDefenders = chosenTarget && opponent && chosenTarget.garrison !== null &&
    view?.units.filter((unit) => unit.cityId === chosenTarget.id && unit.owner !== view.country).every((unit) => unit.strength !== null)
      ? (chosenTarget.garrison ?? 0) + (view?.units.filter((unit) => unit.cityId === chosenTarget.id && unit.owner !== view.country).reduce((sum, unit) => sum + (unit.strength ?? 0), 0) ?? 0)
      : null

  return <section className={styles.cityPanel} aria-label="地区指挥">
    {city ? <>
      <div className={styles.cityTitle}><div><small>选定地区</small><h3>{city.name}</h3></div><span className={own ? styles.friendly : styles.hostile}>{own ? '我方控制' : '敌方控制'}</span></div>
      <p className={styles.description}>{city.description}</p>
      <div className={styles.cityStats}><div><small>城防</small><strong>{city.garrison ?? '—'}</strong></div><div><small>驻军</small><strong>{stationed.reduce((sum, unit) => sum + (unit.strength ?? 0), 0) || '—'}</strong></div><div><small>工厂</small><strong>{city.factories}</strong></div></div>
      {own && <p className={city.supplied ? styles.supplyGood : styles.supplyBad}>{city.supplied ? '● 补给线畅通' : '● 与指挥部失联 · 无法征募及进攻'}</p>}
      {own ? <div className={styles.actions}>
        <div className={styles.actionHeading}>战斗指挥</div>
        <button type="button" disabled={busy || !city.supplied || (view?.gold ?? 0) < 20 || (view?.equipment ?? 0) < 10} onClick={() => onCommand({ type: 'recruit', cityId: city.id, unitId: recruitable?.id })}>＋ {recruitable ? `补充${recruitable.name}` : `在${city.name}组建部队`} <span>20 金 · 10 装备</span></button>
        {chosenUnit && <div className={styles.routeForm}>
          <label htmlFor="unit-choice">指挥部队</label>
          <select id="unit-choice" value={chosenUnit.id} onChange={(event) => {
            const next = ownUnits.find((unit) => unit.id === event.target.value)
            setChoice({ cityId: city.id, unitId: event.target.value, targetId: next?.targetId ?? '' })
          }}>
            {ownUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name} · {unit.strength ?? '?'} 人{unit.order ? ' / 执行中' : ''}</option>)}
          </select>
          {chosenUnit.order && <div className={styles.orderInfo}>当前命令：{chosenUnit.order === 'attack' ? '进攻' : '调动'}{view?.cities.find((target) => target.id === chosenUnit.targetId)?.name ?? '未知'}；本段剩余 {chosenUnit.daysRemaining} 日，后续 {Math.max(0, chosenUnit.route.length - 1)} 段。</div>}
          <label htmlFor="destination-choice">最终目的地 · 自动规划路线</label>
          <select id="destination-choice" value={chosenTarget?.id ?? ''} onChange={(event) => setChoice({ cityId: city.id, unitId: chosenUnit.id, targetId: event.target.value })}>
            <option value="">请选择目标省份</option>
            {view?.cities.filter((target) => target.id !== city.id).map((target) =>
              <option key={target.id} value={target.id}>{target.owner === view.country ? '调动' : '进攻'} · {target.name}</option>
            )}
          </select>
          {chosenTarget && <p className={styles.orderInfo}>{opponent
            ? `目标已知守备：${knownDefenders ?? '情报不足'}；当前兵力：${chosenUnit.strength ?? '未知'}。抵达时重新结算战斗。`
            : `目标属于我方。行军路线由后端规划，途中战线变化时自动重算。`}</p>}
          <button type="button" disabled={busy || !chosenTarget || (chosenUnit.order ? chosenTarget.id === chosenUnit.targetId : false) || (!!opponent && !city.supplied)} onClick={() => chosenTarget && onCommand({ type: chosenUnit.order ? 'redirect' : opponent ? 'attack' : 'move', unitId: chosenUnit.id, targetId: chosenTarget.id })}>{chosenUnit.order ? '↪ 改令 · 额外耗时 1 日' : '➜ 规划路线并下令'}</button>
          {chosenUnit.order && <button type="button" className={styles.cancelButton} disabled={busy} onClick={() => onCommand({ type: 'cancel_order', unitId: chosenUnit.id })}>■ 取消{chosenUnit.name}军令</button>}
        </div>}
        {!ownUnits.length && <p className={styles.muted}>该地区暂无部队，可消耗资源组建一支新军。</p>}
      </div> : <p className={styles.muted}>敌方省份无法直接下令。选择我方部队，拖动到目标省份或在面板选择最终目的地。</p>}
    </> : <div className={styles.empty}><span><IconTarget size={40} /></span><strong>选择一个省份</strong><p>点击地图省份或左侧部队，查看情报；拖动地图上的部队标识即可下令。</p></div>}
  </section>
}
