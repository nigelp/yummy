import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { Icon } from "./Icon";

export function Sheet({
  open,
  onClose,
  children,
  full = false,
  label,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  full?: boolean;
  label?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />
          <motion.div
            className={`sheet ${full ? "full" : ""}`}
            role="dialog"
            aria-label={label}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            drag={full ? false : "y"}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 700) onClose();
            }}
          >
            {!full && <div className="sheet-grip" />}
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}

export function SheetHead({
  title,
  onClose,
  right,
  subtitle,
}: {
  title: string;
  onClose?: () => void;
  right?: ReactNode;
  subtitle?: string;
}) {
  return (
    <div className="sheet-head">
      {onClose && (
        <button className="icon-btn plain" onClick={onClose} aria-label="Close">
          <Icon name="close" size={19} />
        </button>
      )}
      <div className="grow">
        <h2>{title}</h2>
        {subtitle && <p className="tiny muted" style={{ marginTop: 3 }}>{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function ScoreRing({ score, size = 38 }: { score: number; size?: number }) {
  const color =
    score >= 80 ? "var(--pistachio-2)" : score >= 45 ? "#E8B25C" : "var(--peach-2)";
  return (
    <div
      className="score-ring"
      style={{
        width: size,
        height: size,
        background: `conic-gradient(${color} ${Math.max(6, score * 3.6)}deg, rgba(59,46,41,.09) 0deg)`,
      }}
      title={`${score}% of ingredients ready`}
    >
      <span style={{ width: size - 8, height: size - 8 }}>{score}</span>
    </div>
  );
}

export function ScorePill({
  score,
  have,
  total,
}: {
  score: number;
  have?: number;
  total?: number;
}) {
  const cls = score >= 80 ? "high" : score >= 45 ? "mid" : "low";
  const label =
    have !== undefined && total !== undefined
      ? score >= 100
        ? "cook now"
        : `${have}/${total} ready`
      : `${score}%`;
  return (
    <span className={`score-pill ${cls}`}>
      <Icon name={score >= 100 ? "check" : "basket"} size={11} strokeWidth={2.2} />
      {label}
    </span>
  );
}

export function Chip({
  active,
  onClick,
  children,
  soft,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  soft?: boolean;
}) {
  return (
    <button
      className={`chip ${soft ? "soft" : ""} ${active ? "on" : ""}`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

export function Stepper({
  value,
  onChange,
  min = 1,
  max = 24,
  label = "servings",
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  label?: string;
}) {
  return (
    <div className="stepper">
      <button
        type="button"
        aria-label={`Fewer ${label}`}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <Icon name="minus" size={16} strokeWidth={2.2} />
      </button>
      <div className="value">
        {value} <small>{label}</small>
      </div>
      <button
        type="button"
        aria-label={`More ${label}`}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <Icon name="plus" size={16} strokeWidth={2.2} />
      </button>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={option.value === value ? "on" : ""}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({
  emoji,
  title,
  body,
  action,
}: {
  emoji: string;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="bubble">{emoji}</div>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function Toast({ message }: { message?: string }) {
  return createPortal(
    <AnimatePresence>
      {message && (
        <motion.div
          className="toast"
          initial={{ opacity: 0, y: 12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: 0.2 }}
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 48,
        height: 29,
        borderRadius: 999,
        border: "none",
        padding: 3,
        background: checked ? "var(--pistachio-2)" : "#E9DCD2",
        transition: "background .2s ease",
        flex: "none",
      }}
    >
      <span
        style={{
          display: "block",
          width: 23,
          height: 23,
          borderRadius: "50%",
          background: "#fffdfb",
          boxShadow: "0 2px 6px rgba(80,50,40,.2)",
          transform: `translateX(${checked ? 19 : 0}px)`,
          transition: "transform .2s cubic-bezier(.2,.9,.3,1)",
        }}
      />
    </button>
  );
}
