import { useThemeStore } from '../../store/themeStore'
import { FiSun, FiMoon } from 'react-icons/fi'

export default function ThemeToggle() {
  const { theme, toggleTheme } = useThemeStore()
  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      title="Toggle theme"
    >
      {theme === 'light'
        ? <FiMoon className="w-5 h-5 text-gray-600 dark:text-gray-300" />
        : <FiSun  className="w-5 h-5 text-amber-500" />
      }
    </button>
  )
}