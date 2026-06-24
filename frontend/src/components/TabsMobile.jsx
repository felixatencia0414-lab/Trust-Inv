import React from 'react';

export default function TabsMobile({ value, onChange, tabs }) {
  return (
    <div className="sticky bottom-0 z-30 bg-white/95 backdrop-blur border-t px-3 py-2">
      <div className="grid grid-cols-3 gap-2">
        {tabs.map((t) => {
          const active = t.value === value;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => onChange(t.value)}
              className={
                active
                  ? 'px-3 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold'
                  : 'px-3 py-2 rounded-xl border border-slate-300 text-slate-900 text-sm font-semibold'
              }
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

