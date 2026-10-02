import { useEffect, useRef, useState } from 'react'
import type { CityView, GameCommand, UnitView } from '../contracts/game'
import { gameApi } from '../network/gameApi'
import { MapRenderer, type MapMode } from './MapRenderer'
import styles from './MapCanvas.module.css'

interface Props {
  cities: CityView[]
  units: UnitView[]
  selectedCityId: string | null
  mode: MapMode
  enabled: boolean
  onSelect: (id: string) => void
  onOrder: (command: GameCommand) => void
}

export function MapCanvas({ cities, units, selectedCityId, mode, enabled, onSelect, onOrder }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const ghost = useRef<HTMLDivElement>(null)
  const renderer = useRef<MapRenderer | null>(null)
  const latest = useRef({ cities, units, selectedCityId, mode, enabled, onSelect, onOrder })
  const [error, setError] = useState<string | null>(null)
  latest.current = { cities, units, selectedCityId, mode, enabled, onSelect, onOrder }

  useEffect(() => {
    if (!host.current || !ghost.current) return
    let disposed = false
    MapRenderer.create(host.current, ghost.current, gameApi.previewRoute).then((instance) => {
      if (disposed) { instance.destroy(); return }
      renderer.current = instance
      const current = latest.current
      instance.setView(current.cities, current.units, current.selectedCityId, current.mode, current.enabled, current.onSelect, current.onOrder)
    }).catch(() => { if (!disposed) setError('地图初始化失败，请检查浏览器是否支持 WebGL。') })
    return () => {
      disposed = true
      renderer.current?.destroy()
      renderer.current = null
    }
  }, [])

  useEffect(() => {
    renderer.current?.setView(cities, units, selectedCityId, mode, enabled, onSelect, onOrder)
  }, [cities, units, selectedCityId, mode, enabled, onSelect, onOrder])

  return <div className={styles.canvas} ref={host} aria-label="战略地图">
    <div ref={ghost} className={styles.dragGhost} hidden data-state="pending" aria-hidden="true">
      <strong data-unit="" /><span data-message="" />
    </div>
    {error && <p className={styles.error}>{error}</p>}
  </div>
}
