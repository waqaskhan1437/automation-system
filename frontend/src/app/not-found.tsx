export default function NotFound() {
  return (
    <div className="glass-card p-12 text-center max-w-lg mx-auto mt-20">
      <div className="w-16 h-16 rounded-full bg-[rgba(99,102,241,0.15)] flex items-center justify-center mx-auto mb-6">
        <svg className="w-8 h-8 text-[#6366f1]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h2 className="text-xl font-bold mb-2">Page not found</h2>
      <p className="text-[#a1a1aa] mb-6 text-sm">The page you are looking for does not exist.</p>
      <a href="/" className="glass-button-primary inline-block">
        Go to Dashboard
      </a>
    </div>
  );
}