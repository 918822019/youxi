import { Application, Container, Graphics, Rectangle, Text } from 'pixi.js'
import type { FederatedPointerEvent } from 'pixi.js'
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
  private cancelTimer: number | null = null
  private routeLines: { g: Graphics; segs: { x1: number; y1: number; x2: number; y2: number; color: number }[] }[] = []
  private flashLayer: Graphics | null = null
  private flashes: { poly: number[]; start: number }[] = []
  private lastTurn = 0

  private constructor(
    private readonly host: HTMLElement,
    private readonly app: Application,
    private readonly ghost: HTMLDivElement,
    private readonly hover: HTMLDivElement,
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
    app.ticker.add(this.animate)
    this.canvas.addEventListener('wheel', this.wheel, { passive: false })
    this.observer.observe(host)
    this.resize()
  }

  static async create(host: HTMLElement, ghost: HTMLDivElement, hover: HTMLDivElement, requestPreview: (unitId: string, targetId: string) => Promise<RoutePreview>): Promise<MapRenderer> {
    const app = new Application()
    await app.init({ resizeTo: host, background: '#162c32', antialias: true, resolution: Math.min(devicePixelRatio, 2) })
    return new MapRenderer(host, app, ghost, hover, requestPreview)
  }

  setView(cities: CityView[], units: UnitView[], turn: number, selectedId: string | null, mode: MapMode, enabled: boolean, onSelect: (id: string) => void, onOrder: (command: GameCommand) => void): void {
    // Owner flips between snapshots are battles won/lost — flash the province instead of
    // letting the map silently repaint. A backwards turn means load/reset, not a battle.
    const backwards = turn < this.lastTurn
    this.lastTurn = turn
    if (backwards) this.flashes = []
    if (this.cities.length && !backwards) {
      for (const city of cities) {
        const before = this.cities.find((item) => item.id === city.id)
        if (before && before.owner !== city.owner) {
          this.flashes.push({ poly: REGIONS[city.id] ?? [], start: this.app.ticker.lastTime })
        }
      }
    }
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
    // A resize invalidates any pinned/hover placement computed against the old rect.
    if (!this.ghost.hidden) this.placeGhost()
    this.hideHover()
  }

  private draw(): void {
    for (const child of this.world.removeChildren()) child.destroy({ children: true })
    this.routeLines = []
    const sea = new Graphics().rect(-400, -300, 1800, 1200).fill(0x213c42)
    for (let x = -400; x < 1400; x += 36) sea.moveTo(x, -300).lineTo(x, 900).stroke({ color: 0x85a2a0, width: 1, alpha: 0.065 })
    for (let y = -300; y < 900; y += 36) sea.moveTo(-400, y).lineTo(1400, y).stroke({ color: 0x85a2a0, width: 1, alpha: 0.065 })
    this.world.addChild(sea)

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
      province.on('pointerover', () => { province.alpha = 0.82; this.showHover(city) })
      // showHover is idempotent: re-asserting on move self-heals a missed pointerover
      // (Pixi can drop the enter event on the first move after load).
      province.on('pointermove', (event: FederatedPointerEvent) => { this.showHover(city); this.moveHover(event) })
      province.on('pointerout', () => { province.alpha = 1; this.hideHover() })
      province.on('pointertap', () => { if (!this.didDrag) this.onSelect(city.id) })
      this.world.addChild(province)
    }

    // Terrain decoration is purely cartographic; only highlands ("北部山脉，通道狭窄") gets mountain ridges.
    const terrain = new Graphics()
    const highlands = this.cities.find((city) => city.id === 'highlands')
    if (highlands) {
      for (let dx = -70; dx <= 70; dx += 47) {
        const x = highlands.x + dx
        const y = highlands.y - 60
        terrain.moveTo(x - 14, y + 29).lineTo(x + 3, y).lineTo(x + 18, y + 25)
          .stroke({ color: 0xc1d0b7, width: 2, alpha: 0.2 })
      }
    }
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
      // The line itself lives in an animated Graphics (marching dashes); this one keeps
      // only the static waypoint dots and arrowhead.
      const line = new Graphics()
      const segs: { x1: number; y1: number; x2: number; y2: number; color: number }[] = []
      for (let index = 1; index < points.length; index++) {
        const origin = points[index - 1]
        const destination = points[index]
        const color = destination.owner === unit.owner ? 0xe9dfb9 : 0xf0aa84
        segs.push({ x1: origin.x, y1: origin.y, x2: destination.x, y2: destination.y, color })
        if (index < points.length - 1) route.circle(destination.x, destination.y, 5).fill(color)
      }
      this.routeLines.push({ g: line, segs })
      this.world.addChild(line)
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
      const localUnits = this.units.filter((unit) => unit.cityId === city.id)
      // A lone own unit can also be grabbed by its city pin/label — the counter box alone
      // was too small a target to discover. Taps still select the province as before.
      const ownUnit = localUnits.length === 1 && localUnits[0].owner === 'player' ? localUnits[0] : null
      // Pins, labels and badges share one legibility floor so min-zoom stays readable.
      const hudScale = Math.max(1, 0.6 / this.scale)
      const pin = new Graphics().circle(0, 0, selected ? 12 : 9).fill(0xe8d5ad).stroke({ color: 0x26322e, width: 3 })
      pin.position.set(city.x, city.y)
      pin.scale.set(hudScale)
      pin.eventMode = 'static'
      pin.cursor = ownUnit && this.enabled ? 'grab' : 'pointer'
      pin.on('pointerdown', (event) => { if (ownUnit) this.beginUnitDrag(ownUnit, event) })
      pin.on('pointertap', () => { if (!this.didDrag) this.onSelect(city.id) })
      this.world.addChild(pin)
      const name = this.label(city.name, city.x, city.y - 35, 22, '#f5eed7', 'bold')
      name.scale.set(hudScale)
      name.eventMode = 'static'
      name.cursor = ownUnit && this.enabled ? 'grab' : 'pointer'
      name.on('pointerdown', (event) => { if (ownUnit) this.beginUnitDrag(ownUnit, event) })
      name.on('pointertap', () => { if (!this.didDrag) this.onSelect(city.id) })
      this.world.addChild(name)
      localUnits.forEach((unit, index) => {
        const counter = new Container()
        const spacing = Math.max(94 * hudScale, 77 / this.scale)
        counter.position.set(city.x - 42 + (index - (localUnits.length - 1) / 2) * spacing, city.y + 20)
        // Capped inflation keeps badges legible when zoomed out without growing tall
        // enough in world-space to collide with the next row's label.
        counter.scale.set(hudScale)
        const box = new Graphics().roundRect(0, 0, 84, 42, 4).fill(unit.owner === 'player' ? 0x253e35 : 0x51302d)
          .stroke({ color: unit.owner === 'player' ? 0xc4ccac : 0xd2a595, width: 2 })
        counter.addChild(box)
        // Vector glyphs instead of ▣/◆ text: identical rendering on every platform font.
        const glyph = new Graphics()
        if (unit.owner === 'player') {
          glyph.rect(15, 14, 14, 14).stroke({ color: 0xf5edd7, width: 2 }).rect(20, 19, 4, 4).fill(0xf5edd7)
        } else {
          glyph.poly([22, 13, 30, 21, 22, 29, 14, 21]).fill(0xf5edd7)
        }
        counter.addChild(glyph)
        const badge = this.label(`${unit.strength ?? '?'}`, 54, 21, 17, '#f5edd7', 'bold')
        counter.addChild(badge)
        counter.eventMode = 'static'
        counter.hitArea = new Rectangle(-6, -6, 96, 54)
        counter.on('pointerover', () => { box.alpha = 0.8 })
        counter.on('pointerout', () => { box.alpha = 1 })
        counter.cursor = unit.owner === 'player' && this.enabled ? 'grab' : 'pointer'
        counter.on('pointerdown', (event) => this.beginUnitDrag(unit, event))
        counter.on('pointertap', () => { if (!this.didDrag) this.onSelect(city.id) })
        this.world.addChild(counter)
      })
    }

    this.flashLayer = new Graphics()
    this.flashLayer.eventMode = 'none'
    this.world.addChild(this.flashLayer)
    this.preview = new Graphics()
    this.preview.eventMode = 'none'
    this.world.addChild(this.preview)
  }

  private beginUnitDrag(unit: UnitView, event: FederatedPointerEvent): void {
    if (!this.enabled || unit.owner !== 'player' || event.button !== 0) return
    // Pixi global coordinates are canvas-local; pointermove/up are window DOM events.
    const rect = this.canvas.getBoundingClientRect()
    if (this.cancelTimer !== null) {
      window.clearTimeout(this.cancelTimer)
      this.cancelTimer = null
    }
    this.unitDrag = {
      unitId: unit.id, pointerId: event.pointerId,
      startX: rect.left + event.global.x, startY: rect.top + event.global.y,
      moved: false, hoveredId: null, preview: null, pending: null,
      cache: new Map(), lastX: rect.left + event.global.x, lastY: rect.top + event.global.y,
    }
    this.drag = null
    this.didDrag = false
    this.ghost.hidden = true
    this.hideHover()
    this.ghost.querySelector('[data-unit]')!.textContent = `${unit.name} · ${unit.strength ?? '?'} 兵力`
  }

  /** Glanceable province intel on hover; click still owns the detailed panel. */
  private showHover(city: CityView): void {
    if (this.unitDrag || this.drag) return
    const stationed = this.units.filter((unit) => unit.cityId === city.id)
    this.hover.querySelector('[data-name]')!.textContent = `${city.name} · ${city.owner === 'player' ? '我方' : '敌方'}`
    this.hover.querySelector('[data-detail]')!.textContent =
      `城防 ${city.garrison ?? '情报未知'} · 驻军 ${stationed.length} 支`
    this.hover.hidden = false
  }

  private moveHover(event: FederatedPointerEvent): void {
    if (this.unitDrag || this.drag) { this.hideHover(); return }
    const rect = this.canvas.getBoundingClientRect()
    const x = Math.max(4, Math.min(rect.width - 178, event.global.x + 14))
    const y = Math.max(4, Math.min(rect.height - 58, event.global.y + 16))
    this.hover.style.transform = `translate3d(${x}px, ${y}px, 0)`
  }

  private hideHover(): void {
    this.hover.hidden = true
  }

  /** Keep the board at least partly on screen so a wild pan can't lose the map. */
  private clampWorld(): void {
    const rect = this.canvas.getBoundingClientRect()
    const margin = 140
    const width = WORLD_WIDTH * this.scale
    const height = WORLD_HEIGHT * this.scale
    this.world.x = Math.min(rect.width - margin, Math.max(margin - width, this.world.x))
    this.world.y = Math.min(rect.height - margin, Math.max(margin - height, this.world.y))
  }

  /** Pinned top-centre: a cursor-following card kept covering the very province and
   *  preview line the player was aiming at. Narrow maps let the title own the top band. */
  private placeGhost(): void {
    const rect = this.canvas.getBoundingClientRect()
    const ghostY = rect.width < 950 ? 124 : 10
    this.ghost.style.transform = `translate3d(${Math.max(8, (rect.width - 202) / 2)}px, ${ghostY}px, 0)`
  }

  /** Releasing (or Esc) away from any province cancels silently today; say so briefly instead. */
  private flashCancel(message: string): void {
    if (this.cancelTimer !== null) window.clearTimeout(this.cancelTimer)
    this.placeGhost()
    this.ghost.dataset.state = 'invalid'
    this.ghost.querySelector('[data-message]')!.textContent = message
    this.ghost.hidden = false
    this.cancelTimer = window.setTimeout(() => {
      this.ghost.hidden = true
      this.cancelTimer = null
    }, 1000)
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
    let message = result?.reason ??
      (targetId ? `正在规划至${hovered?.name ?? ''}的路线…`
        : hovered ? '拖到目标省份 · Esc 取消'
        : '指针不在省份上 · 拖到省份以下达军令')
    // Attack previews carry the same known-defense math the city panel shows, so the
    // player can judge the strike without opening the panel.
    if (result?.valid && result.action === 'attack' && hovered) {
      const defenders = this.units.filter((unit) => unit.cityId === hovered.id && unit.owner !== source.owner)
      const known = hovered.garrison !== null && defenders.every((unit) => unit.strength !== null)
      message += known
        ? ` · 已知防强 ${(hovered.garrison ?? 0) + defenders.reduce((sum, unit) => sum + (unit.strength ?? 0), 0)}`
        : ' · 防强情报不足'
    }
    this.ghost.dataset.state = state
    this.ghost.querySelector('[data-message]')!.textContent = message
    this.ghost.hidden = false
    this.placeGhost()

    // Attacks preview in the same orange the committed attack arrows use; moves stay green.
    const color = result
      ? (result.valid ? (result.action === 'attack' ? 0xf0aa84 : 0xb8d595) : 0xdd8c79)
      : 0xf1cf83
    this.preview?.clear()
    for (const city of this.cities) {
      if (city.id === from.id) continue
      this.preview?.poly(REGIONS[city.id]).stroke({ color: 0xd9cb98, width: 2, alpha: 0.25 })
    }
    this.preview?.circle(from.x, from.y, 17 / this.scale).stroke({ color: 0xe9d5a2, width: 3 / this.scale, alpha: 0.9 })
    // Never draw a route line into open space (it read as an uncontrolled scribble), but keep a
    // small dim anchor at the cursor so the drag still visibly responds over water.
    if (!hovered) {
      this.preview?.circle(x, y, 5 / this.scale).fill({ color: 0xf1cf83, alpha: 0.45 })
      return
    }
    this.preview?.poly(REGIONS[hovered.id]).fill({ color, alpha: 0.24 }).stroke({ color, width: 6 })
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
      this.preview?.moveTo(from.x, from.y).lineTo(hovered.x, hovered.y).stroke({ color, width: 3, alpha: 0.7 })
    }
    this.preview?.circle(hovered.x, hovered.y, 9 / this.scale).fill(color)
  }

  private pointerDown = (event: PointerEvent): void => {
    if (this.unitDrag || event.button !== 0) return
    this.drag = { x: event.clientX, y: event.clientY }
    this.didDrag = false
    this.hideHover()
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
    this.clampWorld()
    this.drag = { x: event.clientX, y: event.clientY }
  }

  private pointerUp = (event: PointerEvent): void => {
    this.drag = null
    const dragging = this.unitDrag
    if (!dragging || event.pointerId !== dragging.pointerId) return
    this.previewOrder(event.clientX, event.clientY)
    const { unitId, hoveredId, moved, preview, pending } = dragging
    this.pointerCancel()
    if (!moved) return
    if (!hoveredId) {
      this.flashCancel('已取消：松手位置不在省份上')
      return
    }
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
    const moved = this.unitDrag.moved
    this.didDrag = true
    this.pointerCancel()
    if (moved) this.flashCancel('已取消：按 Esc 放弃下达')
  }

  /** Game-feel layer: marching dashes along committed routes + capture flash fade. */
  private animate = (): void => {
    const time = this.app.ticker.lastTime
    if (this.routeLines.length) {
      const offset = (time * 0.05) % 26
      for (const entry of this.routeLines) {
        entry.g.clear()
        for (const seg of entry.segs) {
          const length = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1)
          if (!length) continue
          const ux = (seg.x2 - seg.x1) / length
          const uy = (seg.y2 - seg.y1) / length
          for (let d = -offset; d < length; d += 26) {
            const from = Math.max(0, d)
            const to = Math.min(length, d + 15)
            if (to <= from) continue
            entry.g.moveTo(seg.x1 + ux * from, seg.y1 + uy * from)
              .lineTo(seg.x1 + ux * to, seg.y1 + uy * to)
              .stroke({ color: seg.color, width: 4, alpha: 0.84 })
          }
        }
      }
    }
    if (this.flashLayer) {
      this.flashLayer.clear()
      this.flashes = this.flashes.filter((flash) => time - flash.start < 700)
      for (const flash of this.flashes) {
        this.flashLayer.poly(flash.poly).fill({ color: 0xfff2c8, alpha: 0.45 * (1 - (time - flash.start) / 700) })
      }
    }
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
    this.clampWorld()
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
    this.clampWorld()
  }

  destroy(): void {
    if (this.cancelTimer !== null) window.clearTimeout(this.cancelTimer)
    this.observer.disconnect()
    this.canvas.removeEventListener('pointerdown', this.pointerDown)
    this.canvas.removeEventListener('wheel', this.wheel)
    window.removeEventListener('pointermove', this.pointerMove)
    window.removeEventListener('pointerup', this.pointerUp)
    window.removeEventListener('pointercancel', this.pointerCancel)
    window.removeEventListener('blur', this.pointerCancel)
    window.removeEventListener('keydown', this.keyDown)
    this.app.ticker.remove(this.autoPan)
    this.app.ticker.remove(this.animate)
    this.app.destroy(true, { children: true })
    this.canvas.remove()
  }
}
