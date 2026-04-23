// Build metadata is injected at build time by vite.config.js via `define`.
// In development without git, both fall back to "dev".
/* global __BUILD_SHA__, __BUILD_TIME__ */

const SHA = typeof __BUILD_SHA__ !== 'undefined' ? __BUILD_SHA__ : 'dev';
const BUILD_TIME = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : '';

export default function Footer() {
  const date = BUILD_TIME
    ? new Date(BUILD_TIME).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';
  return (
    <footer className="max-w-5xl mx-auto px-4 py-6 mt-8 text-center text-xs text-slate-500 border-t border-slate-800/60">
      Made by Mike Dulin, MD
      <span className="mx-2 text-slate-700">·</span>
      build <span className="font-mono text-slate-400">{SHA}</span>
      {date && (
        <>
          <span className="mx-2 text-slate-700">·</span>
          <span className="text-slate-600">{date}</span>
        </>
      )}
    </footer>
  );
}
