import { CheckIcon } from "@radix-ui/react-icons";
import { Emblem } from "./Emblem";
import { useVisualStyle, visualStyles } from "./visualStyle";
import type { VisualStyle } from "./types";

export function VisualStyleChoices({ disabled, saving, onChange }: {
  disabled: boolean;
  saving: boolean;
  onChange: (style: VisualStyle) => void;
}) {
  const selected = useVisualStyle();
  return (
    <section className="sc-style-section" aria-label="界面风格">
      <div className="sc-style-heading"><h3>界面风格</h3><span>DSH / VISUAL SYSTEM</span></div>
      <p className="sc-description">徽章、应用图标与开屏一起切换，保存后在网页、桌面和终端共用。</p>
      <div className="sc-style-options" role="group" aria-label="选择 UI 风格">
        {visualStyles.map((style, index) => (
          <button
            key={style.id}
            type="button"
            className={`sc-style-choice sc-style-${style.id}`}
            aria-label={style.label}
            aria-pressed={selected === style.id}
            disabled={disabled}
            onClick={() => { if (selected !== style.id) onChange(style.id); }}
          >
            <span className="sc-style-art" aria-hidden="true">
              <span className="sc-style-number">0{index + 1} / DSH</span>
              <span className="sc-style-orbit" />
              <Emblem size={90} visualStyle={style.id} />
              <span className="sc-style-code">{style.name}</span>
            </span>
            <span className="sc-style-caption">
              <span><strong>{style.label}</strong><small>{style.description}</small></span>
              <span className="sc-style-check" aria-hidden="true">{selected === style.id && <CheckIcon />}</span>
            </span>
          </button>
        ))}
      </div>
      {saving && <p className="sc-description" role="status">正在保存界面风格…</p>}
    </section>
  );
}
