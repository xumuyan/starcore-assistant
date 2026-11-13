// Adapted from beUI motion components (https://beui.dev/components/motion, MIT,
// © 2026 Saurabh Chauhan, source: https://github.com/starc007/ui-components).
// Spring/easing tokens and the Button/Switch/Input structure follow the upstream
// MIT source; Tailwind utility classes are replaced by local CSS in beui.css
// because this offline build has no Tailwind. License copy:
// licenses/beui-motion-MIT.txt. This is an adaptation, not a pixel-exact copy;
// unused variants and error paths are trimmed for the isolated T0 probe.
import React, { forwardRef, useEffect, useId, useState } from 'react';
import { motion, MotionConfig, useReducedMotion } from 'motion/react';

// Shared motion tokens from beUI lib/ease.ts.
const SPRING_PRESS = { type: 'spring', stiffness: 500, damping: 30, mass: 0.6 };
const THUMB_SPRING = { type: 'spring', stiffness: 800, damping: 80, mass: 4 };

// Gate hover effects on devices with a real pointer; upstream use-hover-capable.ts.
function useHoverCapable() {
  const [canHover, setCanHover] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const query = window.matchMedia('(hover: hover) and (pointer: fine)');
    const update = () => setCanHover(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);
  return canHover;
}

const VARIANT_CLASS = {
  primary: 'beui-btn-primary',
  secondary: 'beui-btn-secondary',
  ghost: 'beui-btn-ghost',
  outline: 'beui-btn-outline',
};
const SIZE_CLASS = { sm: 'beui-btn-sm', md: 'beui-btn-md', lg: 'beui-btn-lg' };

export const Button = forwardRef(function Button(
  { variant = 'secondary', size = 'md', pressScale = 0.93, className = '', children, ...rest }, ref,
) {
  const reduce = useReducedMotion();
  const canHover = useHoverCapable();
  return (
    <motion.button
      ref={ref}
      type="button"
      whileTap={reduce ? undefined : { scale: pressScale }}
      whileHover={reduce || !canHover ? undefined : { scale: 1.02 }}
      transition={SPRING_PRESS}
      className={`beui-btn ${VARIANT_CLASS[variant] ?? VARIANT_CLASS.secondary} ${SIZE_CLASS[size] ?? SIZE_CLASS.md} ${className}`.trim()}
      {...rest}
    >
      {children}
    </motion.button>
  );
});

export function Switch({ checked, onCheckedChange, disabled, label, ariaLabel, className = '' }) {
  const id = useId();
  const reduce = useReducedMotion();
  const [isPressed, setIsPressed] = useState(false);
  const squish = !disabled && isPressed && !reduce;
  return (
    <MotionConfig transition={reduce ? { duration: 0 } : THUMB_SPRING}>
      <span className={`beui-switch ${className}`.trim()}>
        <motion.button
          id={id}
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={ariaLabel}
          disabled={disabled}
          onClick={() => !disabled && onCheckedChange(!checked)}
          onPointerDown={() => setIsPressed(true)}
          onPointerUp={() => setIsPressed(false)}
          onPointerLeave={() => setIsPressed(false)}
          initial={false}
          data-state={checked ? 'checked' : 'unchecked'}
          className="beui-switch-track"
        >
          <motion.div layout animate={{ scale: squish ? 0.9 : 1 }} className="beui-switch-thumb" />
        </motion.button>
        {label ? <label htmlFor={id} className="beui-switch-label">{label}</label> : null}
      </span>
    </MotionConfig>
  );
}

export const Input = forwardRef(function Input(
  { label, value, onChange, id: idProp, className = '', ...rest }, ref,
) {
  const reactId = useId();
  const id = idProp ?? reactId;
  const [focused, setFocused] = useState(false);
  return (
    <div className={`beui-input ${className}`.trim()}>
      {label ? <label htmlFor={id} className="beui-input-label">{label}</label> : null}
      <div data-state={focused ? 'focused' : 'idle'} className="beui-input-field">
        <input
          ref={ref}
          id={id}
          value={value}
          onChange={event => onChange?.(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="beui-input-control"
          {...rest}
        />
      </div>
    </div>
  );
});
