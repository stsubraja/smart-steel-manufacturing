import { useEffect, useRef } from 'react';

export default function Feedback({ message, type = 'error', className = '' }: { message: string; type?: 'error' | 'success'; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!message) return;
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    ref.current?.focus({ preventScroll: true });
  }, [message]);
  if (!message) return null;
  const isError = type === 'error';
  return <div ref={ref} className={`${isError ? 'error' : 'success-message'} ${className}`.trim()} role={isError ? 'alert' : 'status'} tabIndex={-1}>{message}</div>;
}
