import { Application, Container, Graphics, Rectangle, Text } from 'pixi.js'
import type { GameCommand, RoutePreview } from '../contracts/game'
import { edge, insidePolygon, REGIONS, REGION_IDS, WORLD_HEIGHT, WORLD_WIDTH } from './geometry'
import type { CityView, UnitView } from '../contracts/game'

export type MapMode = 'political' | 'military'
const OWNER_COLOR = { player: 0x5c7463, rival: 0x96554b }

interface UnitDrag {
  unitId: string
  pointerId: number
  startX: number
  startY: number
  moved: boolean
  hoveredId: string | null
  preview: RoutePreview | null
  pending: Promise<RoutePreview> | null
  cache: Map<string, RoutePreview>
  lastX: number
  lastY: number
}

/** Map owns its camera and graphical objects; React sends only snapshots and selection changes. */
export class MapRenderer {
  private readonly world = new Container()
  private readonly observer: ResizeObserver
  private readonly canvas: HTMLCanvasElement
  private selectedId: string | null = null
  private cities: CityView[] = []
  private units: UnitView[] = []
  private mode: MapMode = 'political'
  private onSelect: (id: string) => void = () => {}
  private onOrder: (command: GameCommand) => void = () => {}
  private enabled = false
  private unitDrag: UnitDrag | null = null
  private preview: Graphics | null = null
  private drag: { x: number; y: number } | null = null
  private didDrag = false
  private scale = 1

  private constructor(
    private readonly host: HTMLElement,
    private readonly app: Application,
    private readonly ghost: HTMLDivElement,
    private readonly requestPreview: (unitId: string, targetId: string) => Promise<RoutePreview>,
  ) {
    this.canvas = app.canvas
    this.observer = new ResizeObserver(() => this.resize())
    app.stage.addChild(this.world)
    host.appendChild(this.canvas)
    this.canvas.addEventListener('pointerdown', this.pointerDown)
    window.addEventListener('pointermove', this.pointerMove)
    window.addEventListener('pointerup', this.pointerUp)
    window.addEventListener('pointercancel', this.pointerCancel)
    window.addEventListener('blur', this.pointerCancel)
    window.addEventListener('keydown', this.keyDown)
    app.ticker.add(this.autoPan)
    this.canvas.addEventListener('wheel', this.wheel, { passive: false })
    this.observer.observe(host)
    this.resize()
  }

  static async create(host: HTMLElement, ghost: HTMLDivElement, requestPreview: (unitId: string, targetId: string) => Promise<RoutePreview>): Promise<MapRenderer> {
    const app = new Application()
    await app.init({ resizeTo: host, background: '#162c32', antialias: true, resolution: Math.min(devicePixelRatio, 2) })
    return new MapRenderer(host, app, ghost, requestPreview)
  }

  setView(cities: CityView[], units: UnitView[], selectedId: string | null, mode: MapMode, enabled: boolean, onSelect: (id: string) => void, onOrder: (command: GameCommand) => void): void {
    this.cities = cities
    this.units = units
    this.selectedId = selectedId
    this.mode = mode
    this.onSelect = onSelect
    this.onOrder = onOrder
    this.enabled = enabled
    if (!enabled) this.pointerCancel()
    this.draw()
  }

  private label(text: string, x: number, y: number, size: number, color: string, weight: 'normal' | 'bold' = 'normal'): Text {
    const label = new Text({ text, style: { fill: color, fontSize: size, fontFamily: 'Georgia, serif', fontWeight: weight, letterSpacing: 2 } })
    label.anchor.set(0.5)
    label.position.set(x, y)
    return label
  }

  private resize(): void {
    const { width, height } = this.host.getBoundingClientRect()
    if (!width || !height) return
    const oldWidth = this.app.renderer.width / this.app.renderer.resolution
    const oldHeight = this.app.renderer.height / this.app.renderer.resolution
    this.app.renderer.resize(width, height)
    if (this.world.x === 0 && this.world.y === 0) {
      this.scale = Math.min(width / WORLD_WIDTH, height / WORLD_HEIGHT) * 0.98
      this.world.scale.set(this.scale)
      this.world.position.set((width - WORLD_WIDTH * this.scale) / 2, (height - WORLD_HEIGHT * this.scale) / 2)
    } else {
      this.world.position.set(this.world.x + (width - oldWidth) / 2, this.world.y + (height - oldHeight) / 2)
    }
  }

  private draw(): void {
    for (const child of this.world.removeChildren()) child.destroy({ children: true })
    const sea = new Graphics().rect(-400, -300, 1800, 1200).fill(0x213c42)
    for (let x = -400; x < 1400; x += 36) sea.moveTo(x, -300).lineTo(x, 900).stroke({ color: 0x85a2a0, width: 1, alpha: 0.065 })
    for (let y = -300; y < 900; y += 36) sea.moveTo(-400, y).lineTo(1400, y).stroke({ color: 0x85a2a0, width: 1, alpha: 0.065 })
    this.world.addChild(sea)
    this.world.addChild(this.label('THE NORTHERN SEA', 697, 557, 15, '#638386'))
    this.world.addChild(this.label('THE WESTERN REACH', 171, 578, 12, '#638386'))

    const shadow = new Graphics()
    for (const points of Object.values(REGIONS)) shadow.poly(points.map((value, index) => value + (index % 2 ? 11 : 12))).fill({ color: 0x0b1c20, alpha: 0.52 })
    this.world.addChild(shadow)

    for (const city of this.cities) {
      const selected = city.id === this.selectedId
      const strength = this.units.filter((unit) => unit.cityId === city.id).reduce((sum, unit) => sum + (unit.strength ?? 0), 0)
      const base = this.mode === 'political' ? OWNER_COLOR[city.owner] : city.owner === 'rival' ? 0x625755 : 0x555e54
      const color = this.mode === 'military' && strength > 30 ? (city.owner === 'player' ? 0x71866a : 0x986354) : base
      const province = new Graphics().poly(REGIONS[city.id] ?? []).fill(color)
        .stroke({ color: selected ? 0xf3dba7 : 0x263b37, width: selected ? 5 : 2.5, alpha: 0.95 })
      province.eventMode = 'static'
      province.cursor = 'pointer'
      province.on('pointerover', () => { province.alpha = 0.82 })
      province.on('pointerout', () => { province.alpha = 1 })
      province.on('pointertap', () => { if (!this.didDrag) this.onSelect(city.id) })
      this.world.addChild(province)
    }

    // Terrain/river strokes are purely cartographic, never a second source of game rules.
    const terrain = new Graphics()
    for (let x = 124; x < 370; x += 47) {
      terrain.moveTo(x - 14, 200).lineTo(x + 3, 171).lineTo(x + 18, 196)
        .stroke({ color: 0xc1d0b7, width: 2, alpha: 0.17 })
      terrain.moveTo(x - 5, 426).lineTo(x + 11, 399).lineTo(x + 24, 421)
        .stroke({ color: 0xc1d0b7, width: 2, alpha: 0.14 })
    }
    terrain.moveTo(400, 109).bezierCurveTo(442, 160, 389, 330, 538, 467).stroke({ color: 0x9bbcc0, width: 4, alpha: 0.43 })
    terrain.moveTo(212, 318).bezierCurveTo(403, 299, 542, 231, 737, 342).stroke({ color: 0xe0cba1, width: 2, alpha: 0.47 })
    this.world.addChild(terrain)

    const provinces = new Map(this.cities.map((city) => [city.id, city]))
    const frontline = new Graphics()
    REGION_IDS.forEach((id, index) => {
      const row = Math.floor(index / 3)
      const col = index % 3
      for (const direction of ['right', 'down'] as const) {
        if (direction === 'right' && col === 2 || direction === 'down' && row === 2) continue
        const neighbor = REGION_IDS[direction === 'right' ? index + 1 : index + 3]
        if (provinces.get(id)?.owner === provinces.get(neighbor)?.owner) continue
        const [x1, y1, x2, y2] = edge(row, col, direction)
        frontline.moveTo(x1, y1).lineTo(x2, y2).stroke({ color: 0x241c17, width: 12, alpha: 0.45 })
        frontline.moveTo(x1, y1).lineTo(x2, y2).stroke({ color: 0xe1aa77, width: 4, alpha: 0.94 })
      }
    })
    this.world.addChild(frontline)

    // Draw only server-approved routes visible in the player's view.
    for (const unit of this.units) {
      if (!unit.targetId || !unit.order) continue
      const from = this.cities.find((city) => city.id === unit.cityId)
      if (!from) continue
      const stops = (unit.route.length ? unit.route : [unit.targetId])
        .map((id) => this.cities.find((city) => city.id === id))
      if (stops.some((city) => !city)) continue
      const points = [from, ...stops] as CityView[]
      const route = new Graphics()
      for (let index = 1; index < points.length; index++) {
        const origin = points[index - 1]
        const destination = points[index]
        const color = destination.owner === unit.owner ? 0xe9dfb9 : 0xf0aa84
        route.moveTo(origin.x, origin.y).lineTo(destination.x, destination.y)
          .stroke({ color, width: 4, alpha: 0.84 })
        if (index < points.length - 1) route.circle(destination.x, destination.y, 5).fill(color)
      }
      const last = points.at(-1)!
      const previous = points.at(-2)!
      const angle = Math.atan2(last.y - previous.y, last.x - previous.x)
      const x = last.x - Math.cos(angle) * 24
      const y = last.y - Math.sin(angle) * 24
      const arrowColor = last.owner === unit.owner ? 0xe9dfb9 : 0xf0aa84
      route.moveTo(x, y).lineTo(x - 15 * Math.cos(angle - 0.55), y - 15 * Math.sin(angle - 0.55))
        .moveTo(x, y).lineTo(x - 15 * Math.cos(angle + 0.55), y - 15 * Math.sin(angle + 0.55))
        .stroke({ color: arrowColor, width: 4 })
      this.world.addChild(route)
    }

    for (const city of this.cities) {
      const selected = city.id === this.selectedId
      const pin = new Graphics().circle(0, 0, selected ? 12 : 9).fill(0xe8d5ad).stroke({ color: 0x26322e, width: 3 })
      pin.position.set(city.x, city.y)
      pin.eventMode = 'static'
      pin.cursor = 'pointer'
      pin.on('pointertap', () => { if (!this.didDrag) this.onSelect(city.id) })
      this.world.addChild(pin)
      const name = this.label(city.name, city.x, city.y - 35, 22, '#f5eed7', 'bold')
      name.eventMode = 'static'
      name.cursor = 'pointer'
      name.on('pointertap', () => { if (!this.didDrag) this.onSelect(city.id) })
      this.world.addChild(name)
      const localUnits = this.units.filter((unit) => unit.cityId === city.id)
      localUnits.forEach((unit, index) => {
        const counter = new Container()
        const spacing = Math.max(94, 77 / this.scale)
        counter.position.set(city.x - 42 + (index - (localUnits.length - 1) / 2) * spacing, city.y + 20)
        counter.scale.set(Math.max(1, 0.78 / this.scale))
        const box = new Graphics().roundRect(0, 0, 84, 42, 4).fill(unit.owner === 'player' ? 0x253e35 : 0x51302d)
          .stroke({ color: unit.owner === 'player' ? 0xc4ccac : 0xd2a595, width: 2 })
        counter.addChild(box)
        const badge = this.label(`${unit.owner === 'player' ? '▣' : '◆'} ${unit.strength ?? '?'}`, 42, 21, 17, '#f5edd7', 'bold')
        counter.addChild(badge)
        counter.eventMode = 'static'
        counter.hitArea = new Rectangle(-6, -6, 96, 54)
        counter.on('pointerover', () => { box.alpha = 0.8 })
        counter.on('pointerout', () => { box.alpha = 1 })
        counter.cursor = unit.owner === 'player' && this.enabled ? 'grab' : 'pointer'
        counter.on('pointerdown', (event) => {
          if (!this.enabled || unit.owner !== 'player' || event.button !== 0) return
          // Pixi global coordinates are canvas-local; pointermove/up are window DOM events.
          const rect = this.canvas.getBoundingClientRect()
          this.unitDrag = {
            unitId: unit.id, pointerId: event.pointerId,
            startX: rect.left + event.global.x, startY: rect.top + event.global.y,
            moved: false, hoveredId: null, preview: null, pending: null,
            cache: new Map(), lastX: rect.left + event.global.x, lastY: rect.top + event.global.y,
          }
          this.drag = null
          this.didDrag = false
          this.ghost.querySelector('[data-unit]')!.textContent = `${unit.name} · ${unit.strength ?? '?'} 兵力`
        })
        counter.on('pointertap', () => { if (!this.didDrag) this.onSelect(city.id) })
        this.world.addChild(counter)
      })
    }

    this.preview = new Graphics()
    this.preview.eventMode = 'none'
    this.world.addChild(this.preview)
  }

  private previewOrder(xClient: number, yClient: number): void {
    const dragging = this.unitDrag
    if (!dragging || !dragging.moved) return
    dragging.lastX = xClient
    dragging.lastY = yClient
    const rect = this.canvas.getBoundingClientRect()
    const px = xClient - rect.left
    const py = yClient - rect.top
    const x = (px - this.world.x) / this.scale
    const y = (py - this.world.y) / this.scale
    const source = this.units.find((unit) => unit.id === dragging.unitId)
    const from = this.cities.find((city) => city.id === source?.cityId)
    if (!source || !from) return
    const hovered = this.cities.find((city) => insidePolygon(x, y, REGIONS[city.id] ?? []))
    const targetId = hovered?.id === from.id ? null : hovered?.id ?? null
    if (dragging.hoveredId !== targetId) {
      dragging.hoveredId = targetId
      dragging.preview = targetId ? dragging.cache.get(targetId) ?? null : null
      dragging.pending = null
      if (targetId && !dragging.preview) {
        const request = this.requestPreview(source.id, targetId)
        dragging.pending = request
        void request.then((result) => {
          dragging.cache.set(targetId, result)
          if (this.unitDrag !== dragging || dragging.hoveredId !== targetId) return
          dragging.preview = result
          dragging.pending = null
          this.previewOrder(dragging.lastX, dragging.lastY)
        }).catch(() => {
          if (this.unitDrag !== dragging || dragging.hoveredId !== targetId) return
          dragging.preview = { unitId: source.id, targetId, valid: false, action: null, route: [], eta: null, reason: '路线预览失败，请检查连接' }
          dragging.pending = null
          this.previewOrder(dragging.lastX, dragging.lastY)
        })
      }
    }
    const result = dragging.preview
    const state = result ? (result.valid ? 'valid' : 'invalid') : 'pending'
    this.ghost.dataset.state = state
    this.ghost.querySelector('[data-message]')!.textContent = result?.reason ??
      (targetId ? `正在规划至${hovered?.name ?? ''}的路线…` : '拖到目标省份 · Esc 取消')
    this.ghost.hidden = false
    this.ghost.style.transform = `translate3d(${Math.max(8, Math.min(rect.width - 210, px + 22))}px, ${Math.max(8, Math.min(rect.height - 88, py - 91))}px, 0)`

    const color = result ? (result.valid ? 0xb8d595 : 0xdd8c79) : 0xf1cf83
    this.preview?.clear()
    for (const city of this.cities) {
      if (city.id === from.id) continue
      this.preview?.poly(REGIONS[city.id]).stroke({ color: 0xd9cb98, width: 2, alpha: 0.25 })
    }
    this.preview?.circle(from.x, from.y, 17 / this.scale).stroke({ color: 0xe9d5a2, width: 3 / this.scale, alpha: 0.9 })
    if (hovered) this.preview?.poly(REGIONS[hovered.id]).fill({ color, alpha: 0.24 }).stroke({ color, width: 6 })
    if (result?.valid && result.route.length) {
      let previous = from
      for (const stop of result.route) {
        const next = this.cities.find((city) => city.id === stop)
        if (!next) continue
        this.preview?.moveTo(previous.x, previous.y).lineTo(next.x, next.y).stroke({ color, width: 5, alpha: 0.92 })
        if (stop !== result.route.at(-1)) this.preview?.circle(next.x, next.y, 6).fill(color)
        previous = next
      }
    } else {
      this.preview?.moveTo(from.x, from.y).lineTo(x, y).stroke({ color, width: 3, alpha: 0.7 })
    }
    this.preview?.circle(x, y, 9 / this.scale).fill(color)
  }

  private pointerDown = (event: PointerEvent): void => {
    if (this.unitDrag || event.button !== 0) return
    this.drag = { x: event.clientX, y: event.clientY }
    this.didDrag = false
  }

  private pointerMove = (event: PointerEvent): void => {
    if (this.unitDrag) {
      if (event.pointerId !== this.unitDrag.pointerId) return
      if (Math.hypot(event.clientX - this.unitDrag.startX, event.clientY - this.unitDrag.startY) > 8) {
        this.unitDrag.moved = true
        this.didDrag = true
      }
      this.previewOrder(event.clientX, event.clientY)
      return
    }
    if (!this.drag) return
    if (Math.abs(event.clientX - this.drag.x) + Math.abs(event.clientY - this.drag.y) > 2) this.didDrag = true
    this.world.position.set(this.world.x + event.clientX - this.drag.x, this.world.y + event.clientY - this.drag.y)
    this.drag = { x: event.clientX, y: event.clientY }
  }

  private pointerUp = (event: PointerEvent): void => {
    this.drag = null
    const dragging = this.unitDrag
    if (!dragging || event.pointerId !== dragging.pointerId) return
    this.previewOrder(event.clientX, event.clientY)
    const { unitId, hoveredId, moved, preview, pending } = dragging
    this.pointerCancel()
    if (!moved || !hoveredId) return
    const submit = (result: RoutePreview): void => {
      if (!result.valid || !this.enabled || result.unitId !== unitId || result.targetId !== hoveredId) return
      const unit = this.units.find((item) => item.id === unitId)
      if (!unit) return
      this.onSelect(unit.cityId)
      this.onOrder({ type: unit.order ? 'redirect' : result.action ?? 'move', unitId, targetId: hoveredId })
    }
    if (preview) submit(preview)
    else if (pending) void pending.then(submit).catch(() => {})
  }

  private pointerCancel = (): void => {
    this.drag = null
    this.unitDrag = null
    this.preview?.clear()
    this.ghost.hidden = true
  }

  private keyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !this.unitDrag) return
    event.preventDefault()
    this.didDrag = true
    this.pointerCancel()
  }

  private autoPan = (): void => {
    const dragging = this.unitDrag
    if (!dragging?.moved) return
    const rect = this.canvas.getBoundingClientRect()
    const x = dragging.lastX - rect.left
    const y = dragging.lastY - rect.top
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return
    const margin = 35
    const dx = x < margin ? 6 : x > rect.width - margin ? -6 : 0
    const dy = y < margin ? 6 : y > rect.height - margin ? -6 : 0
    if (!dx && !dy) return
    this.world.position.set(this.world.x + dx, this.world.y + dy)
    this.previewOrder(dragging.lastX, dragging.lastY)
  }

  private wheel = (event: WheelEvent): void => {
    event.preventDefault()
    if (this.unitDrag) return
    const nextScale = Math.max(0.35, Math.min(2.2, this.scale * (event.deltaY < 0 ? 1.1 : 0.9)))
    const bounds = this.canvas.getBoundingClientRect()
    const px = event.clientX - bounds.left
    const py = event.clientY - bounds.top
    const factor = nextScale / this.scale
    this.world.position.set(px - (px - this.world.x) * factor, py - (py - this.world.y) * factor)
    this.world.scale.set(nextScale)
    this.scale = nextScale
  }

  destroy(): void {
    this.observer.disconnect()
    this.canvas.removeEventListener('pointerdown', this.pointerDown)
    this.canvas.removeEventListener('wheel', this.wheel)
    window.removeEventListener('pointermove', this.pointerMove)
    window.removeEventListener('pointerup', this.pointerUp)
    window.removeEventListener('pointercancel', this.pointerCancel)
    window.removeEventListener('blur', this.pointerCancel)
    window.removeEventListener('keydown', this.keyDown)
    this.app.ticker.remove(this.autoPan)
    this.app.destroy(true, { children: true })
    this.canvas.remove()
  }
}
