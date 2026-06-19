interface Props {
  message: string;
  type?: 'success' | 'error';
}

export default function CopyToast({ message, type = 'success' }: Props) {
  return (
    <div
      className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg text-sm shadow-lg transition-all ${
        type === 'error' ? 'bg-red-500/90 text-white' : 'bg-green-500 text-white'
      }`}
    >
      {message}
    </div>
  );
}
