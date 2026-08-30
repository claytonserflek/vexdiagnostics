import { useId, useState } from "react";

/** A small "?" affordance next to a metric label that explains it on
 * hover/focus. Keyboard accessible (focusable button + aria-describedby),
 * not just a mouse hover trick. */
export function InfoTooltip({ text }: { text: string }) {
  const [visible, setVisible] = useState(false);
  const id = useId();

  return (
    <span className="tooltip-wrap">
      <button
        type="button"
        className="tooltip-trigger"
        aria-describedby={id}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
      >
        ?
      </button>
      {visible && (
        <span role="tooltip" id={id} className="tooltip-bubble">
          {text}
        </span>
      )}
    </span>
  );
}
