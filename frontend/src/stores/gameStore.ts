import { create } from 'zustand'
import type { PlayerView } from '../contracts/game'

interface GameStore {
  view: PlayerView | null
  selectedCityId: string | null
  setView: (view: PlayerView) => void
  selectCity: (cityId: string) => void
}

export const useGameStore = create<GameStore>((set) => ({
  view: null,
  selectedCityId: null,
  setView: (view) =>
    set((state) => ({
      view,
      selectedCityId: view.cities.some((city) => city.id === state.selectedCityId)
        ? state.selectedCityId
        : null,
    })),
  selectCity: (selectedCityId) => set({ selectedCityId }),
}))
