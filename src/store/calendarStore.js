import { create } from "zustand"
import { persist } from "zustand/middleware"

export const useCalendarStore = create(
  persist(
    (set) => ({
      calendarType: "BS",
      toggleCalendar: () =>
        set((state) => ({ calendarType: state.calendarType === "BS" ? "AD" : "BS" })),
    }),
    { name: "retailsense-calendar" }
  )
)
