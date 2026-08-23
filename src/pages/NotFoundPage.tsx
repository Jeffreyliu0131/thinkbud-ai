import { useNavigate } from 'react-router-dom'
import BudMascot from '../components/BudMascot'

export default function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <main className="flex flex-col items-center justify-center h-full px-6">
      <div className="w-24 h-28 mb-4" aria-hidden="true">
        <BudMascot animate="idle" />
      </div>
      <h1 className="text-2xl font-bold text-gray-800 mb-2">找不到这个页面</h1>
      <p className="text-gray-500 mb-6 text-center">这个页面不存在哦，回到首页继续学习吧</p>
      <button
        onClick={() => navigate('/', { replace: true })}
        className="px-6 py-3 bg-teal-500 text-white rounded-2xl font-semibold hover:bg-teal-600 active:scale-[0.98] transition-all"
      >
        回到首页
      </button>
    </main>
  )
}
