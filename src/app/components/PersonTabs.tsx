"use client";

import { Children, useState } from "react";
import type { Flag } from "@/lib/metrics";

interface TabMeta {
  id: string;
  name: string;
  worstFlag: Flag;
  cardiac: boolean;
}

// Show one person at a time behind a segmented control — cleaner and more
// app-like than stacking everyone. The person sections are rendered on the
// server and handed in as children; this only picks which one is visible.
export function PersonTabs({ tabs, children }: { tabs: TabMeta[]; children: React.ReactNode }) {
  const [active, setActive] = useState(0);
  const kids = Children.toArray(children);

  return (
    <>
      <div className="person-tabs" role="tablist" aria-label="Person">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active === i}
            className={active === i ? "active" : ""}
            onClick={() => setActive(i)}
          >
            <span className={`status-dot status-${t.worstFlag}`} aria-hidden="true" />
            {t.name}
            {t.cardiac && <span className="tab-cardiac">cardiac</span>}
          </button>
        ))}
      </div>
      {kids[active]}
    </>
  );
}
