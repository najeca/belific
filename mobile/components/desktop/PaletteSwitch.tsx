import React from 'react';
import Toggle from '../Toggle';

// The desktop's switch (checkpoint 9.1; redrawn in 3.15.0): the shared Toggle, kept under this name for its
// callers. See components/Toggle.tsx.
export default function PaletteSwitch({
  value,
  onValueChange,
  label,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
  label: string;
}) {
  return <Toggle value={value} onValueChange={onValueChange} label={label} />;
}
