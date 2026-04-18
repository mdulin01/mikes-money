export default function LoadingScreen({ msg = 'Loading…' }) {
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="text-slate-400 text-sm animate-pulse">{msg}</div>
    </div>
  );
}
