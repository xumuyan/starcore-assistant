import React from 'react';
import { BorderBeam } from 'border-beam';

// libraries.dev/beam, pinned MIT package. One beam around the whole surface,
// not one per button. Keep the rounded surface as the wrapper's first child.
export function BeamPanel({ children, className = '', label }) {
  return <BorderBeam theme="dark" size="md" colorVariant="colorful" className="probe-beam">
    <section className={`probe-surface ${className}`.trim()} aria-label={label}>{children}</section>
  </BorderBeam>;
}
