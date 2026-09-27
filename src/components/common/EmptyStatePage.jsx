import { FileText } from "lucide-react"

export default function EmptyStatePage({ title, description, buttonLabel, onCreate, Icon = FileText }) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-24 px-6 text-center">
      <div className="w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-5">
        <Icon size={32} className="text-gray-300 dark:text-gray-600" />
      </div>
      <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">{title}</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs mb-5">{description}</p>
      {buttonLabel && (
        <button onClick={onCreate} className="btn-sm btn-primary">
          + {buttonLabel}
        </button>
      )}
    </div>
  )
}
