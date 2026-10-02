/** Client only receives information allowed by its player's view. */
export type CountryId = 'player' | 'rival'
export type Production = 'equipment' | 'supplies'

export interface CityView {
  id: string
  name: string
  x: number
  y: number
  owner: CountryId
  garrison: number | null
  factories: number
  supplied: boolean | null
  description: string
  neighbors: string[]
}

export interface UnitView {
  id: string
  name: string
  owner: CountryId
  cityId: string
  strength: number | null
  supplied: boolean | null
  targetId: string | null
  order: 'move' | 'attack' | null
  daysRemaining: number
  route: string[]
}

export interface Report { id: number; turn: number; text: string }
export interface GameCommand {
  type: 'recruit' | 'move' | 'attack' | 'hold' | 'set_production' | 'cancel_order' | 'redirect'
  cityId?: string
  unitId?: string
  targetId?: string
  focus?: Production
}
export interface CommandResult { command: GameCommand; accepted: boolean; reason: string }
export interface PlayerView {
  country: CountryId
  winner: CountryId | null
  turn: number
  gold: number
  equipment: number
  supplies: number
  factories: number
  production: Production
  cities: CityView[]
  units: UnitView[]
  reports: Report[]
  commandResults: CommandResult[]
}
export interface AiDebug {
  observation: PlayerView | null
  plan: string
  commands: GameCommand[]
  results: CommandResult[]
  currentOrders: UnitView[]
}


export interface RoutePreview {
  unitId: string
  targetId: string
  valid: boolean
  action: 'move' | 'attack' | null
  route: string[]
  eta: number | null
  reason: string
}
