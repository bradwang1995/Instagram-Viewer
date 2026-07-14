import { create } from "zustand";

type SlideshowState = {
  currentSlideIndex: number;
  isPlaying: boolean;
  isShuffle: boolean;
  intervalMs: number;
  setCurrentSlideIndex: (index: number) => void;
  nextSlide: (total: number) => void;
  previousSlide: (total: number) => void;
  togglePlaying: () => void;
  setPlaying: (value: boolean) => void;
  toggleShuffle: () => void;
  setIntervalMs: (value: number) => void;
};

export const useSlideshowState = create<SlideshowState>((set) => ({
  currentSlideIndex: 0,
  isPlaying: false,
  isShuffle: false,
  intervalMs: 5000,
  setCurrentSlideIndex: (index) => set({ currentSlideIndex: index }),
  nextSlide: (total) =>
    set((state) => ({
      currentSlideIndex:
        total > 0 ? (state.currentSlideIndex + 1) % total : state.currentSlideIndex,
    })),
  previousSlide: (total) =>
    set((state) => ({
      currentSlideIndex:
        total > 0
          ? (state.currentSlideIndex - 1 + total) % total
          : state.currentSlideIndex,
    })),
  togglePlaying: () => set((state) => ({ isPlaying: !state.isPlaying })),
  setPlaying: (value) => set({ isPlaying: value }),
  toggleShuffle: () => set((state) => ({ isShuffle: !state.isShuffle })),
  setIntervalMs: (value) => set({ intervalMs: value }),
}));
