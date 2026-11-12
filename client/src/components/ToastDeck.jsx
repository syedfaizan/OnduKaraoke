/** Floating status messages ("Added to the queue 🎤", quota errors, …). */
export default function ToastDeck({ toasts = [] }) {
  return (
    <div className="toast-deck" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.tone}`}>
          {toast.message}
        </div>
      ))}
    </div>
  );
}
