import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function HelloBackend() {
  const [msg, setMsg] = useState<string>('');

  useEffect(() => {
    api.get<{ message: string }>('/').then((r) => setMsg(r.data.message));
  }, []);

  return (
    <div className="p-4">
      <div className="text-sm text-slate-600">Hello World</div>
      <div className="text-lg font-semibold">{msg || '—'}</div>
    </div>
  );
}

