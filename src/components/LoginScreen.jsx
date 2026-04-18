export default function LoginScreen({ onLogin }) {
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 p-8 max-w-md w-full text-center">
        <div className="text-5xl mb-3">💰</div>
        <h1 className="text-3xl font-bold text-emerald-400 mb-1">Mike's Money</h1>
        <p className="text-slate-400 mb-6">Personal finance, owned data.</p>
        <button
          onClick={onLogin}
          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-3 rounded-lg transition-colors"
        >
          Sign in with Google
        </button>
        <p className="text-xs text-slate-500 mt-4">Access restricted to approved users.</p>
      </div>
    </div>
  );
}
