import RestPanel from './panels/RestPanel'
import SsePanel from './panels/SsePanel'
import WsPanel from './panels/WsPanel'
import GrpcPanel from './panels/GrpcPanel'
import LongPollPanel from './panels/LongPollPanel'

export default function App() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-8">
      <h1 className="text-3xl font-bold mb-8 text-center">Polyping</h1>
      <p className="text-center text-gray-400 mb-8">
        5 ways to say ping. Same answer every time.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
        <RestPanel />
        <SsePanel />
        <WsPanel />
        <GrpcPanel />
        <LongPollPanel />
      </div>
    </div>
  )
}
