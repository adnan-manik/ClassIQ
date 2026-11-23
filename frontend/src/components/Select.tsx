"use client";

/**
 * ClassIQ dropdown — a styled, accessible replacement for native <select>.
 *
 * - Select-only combobox (WAI-ARIA APG): the trigger is a `combobox` button,
 *   the options a `listbox`. Arrow keys, Home/End, PageUp/PageDown, Enter /
 *   Space, Escape, Tab and type-ahead work as in a native select.
 * - Long lists get a search box (automatic above SEARCH_THRESHOLD options).
 * - The list is portaled to <body> with fixed positioning, so it is never
 *   clipped by a modal, a card or a scrolling table, and it flips above the
 *   trigger when there is no room below.
 * - `name` / `required` render a real (visually hidden) input, so server-action
 *   forms receive the value and browser validation still blocks empty submits.
 * - Works controlled (`value`) or uncontrolled (`defaultValue`).
 */

import { Check, ChevronDown, Search } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { BRAND } from "@/lib/brand";

export type SelectOption = {
  value: string;
  label: string;
  /** Secondary text shown under the label and matched by search (an ID, an email…). */
  hint?: string;
  disabled?: boolean;
};

type Props = {
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Shown when no option matches the value. */
  placeholder?: string;
  size?: "sm" | "md";
  variant?: "field" | "pill";
  /** Search box above the list. Defaults to on for long lists. */
  searchable?: boolean;
  searchPlaceholder?: string;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  /** Classes for the outer wrapper (width, min-width…). Defaults to full width. */
  className?: string;
};

const SEARCH_THRESHOLD = 10;
const LIST_MAX_HEIGHT = 288; // px, matches max-h-72
const GAP = 6;

type Placement = { top?: number; bottom?: number; left: number; width: number; maxHeight: number };

function placementFor(trigger: HTMLElement): Placement {
  const r = trigger.getBoundingClientRect();
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const below = vh - r.bottom - GAP - 8;
  const above = r.top - GAP - 8;
  const width = Math.min(Math.max(r.width, 200), vw - 16);
  const left = Math.min(Math.max(8, r.left), vw - width - 8);
  if (below >= Math.min(LIST_MAX_HEIGHT, 160) || below >= above) {
    return { top: r.bottom + GAP, left, width, maxHeight: Math.max(120, Math.min(LIST_MAX_HEIGHT, below)) };
  }
  return { bottom: vh - r.top + GAP, left, width, maxHeight: Math.max(120, Math.min(LIST_MAX_HEIGHT, above)) };
}

export default function Select({
  options,
  value,
  defaultValue,
  onChange,
  placeholder = "Select…",
  size = "md",
  variant = "field",
  searchable,
  searchPlaceholder = "Search…",
  disabled = false,
  required = false,
  name,
  id,
  className = "w-full",
  ...aria
}: Props) {
  const autoId = useId();
  const triggerId = id ?? `sel-${autoId}`;
  const listId = `${triggerId}-list`;
  const optionId = (i: number) => `${triggerId}-opt-${i}`;

  const [inner, setInner] = useState(defaultValue ?? "");
  const current = value ?? inner;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const [place, setPlace] = useState<Placement | null>(null);
  const [invalid, setInvalid] = useState(false);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const typeahead = useRef({ text: "", at: 0 });

  const withSearch = searchable ?? options.length > SEARCH_THRESHOLD;
  const selected = options.find((o) => o.value === current);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || (o.hint ?? "").toLowerCase().includes(q),
    );
  }, [options, query]);

  const firstEnabled = (list: SelectOption[], from = 0, step = 1) => {
    for (let i = from; i >= 0 && i < list.length; i += step) if (!list[i].disabled) return i;
    return -1;
  };

  const openList = useCallback(
    (highlight?: "first" | "last") => {
      if (disabled || !triggerRef.current) return;
      setPlace(placementFor(triggerRef.current));
      setQuery("");
      const sel = options.findIndex((o) => o.value === current && !o.disabled);
      setActive(
        highlight === "last"
          ? firstEnabled(options, options.length - 1, -1)
          : highlight === "first" || sel < 0
            ? firstEnabled(options)
            : sel,
      );
      setOpen(true);
    },
    [disabled, options, current],
  );

  const close = useCallback((refocus = true) => {
    setOpen(false);
    setQuery("");
    if (refocus) triggerRef.current?.focus();
  }, []);

  const choose = (opt: SelectOption | undefined) => {
    if (!opt || opt.disabled) return;
    if (value === undefined) setInner(opt.value);
    setInvalid(false);
    if (opt.value !== current) onChange?.(opt.value);
    close();
  };

  // Follow the trigger while open; close on outside press.
  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      if (triggerRef.current) setPlace(placementFor(triggerRef.current));
    };
    const onPress = (e: PointerEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || listRef.current?.parentElement?.contains(t)) return;
      close(false);
    };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    document.addEventListener("pointerdown", onPress, true);
    if (withSearch) searchRef.current?.focus();
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      document.removeEventListener("pointerdown", onPress, true);
    };
  }, [open, withSearch, close]);

  // A combobox is not named from its content, and Chrome doesn't name a
  // <button> from a wrapping <label>. Name it from the field's label text
  // (label[for=id] or an enclosing <label>), minus the trigger's own value.
  const ariaLabel = aria["aria-label"];
  const ariaLabelledby = aria["aria-labelledby"];
  useEffect(() => {
    const el = triggerRef.current;
    if (!el || ariaLabel || ariaLabelledby) return;
    const label =
      document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(triggerId)}"]`) ??
      el.closest("label");
    if (!label) return;
    const copy = label.cloneNode(true) as HTMLElement;
    copy
      .querySelectorAll("button, input, select, textarea, [aria-hidden='true']")
      .forEach((n) => n.remove());
    const text = copy.textContent?.replace(/\s+/g, " ").trim();
    if (text) el.setAttribute("aria-label", text);
    else el.removeAttribute("aria-label");
  }, [triggerId, ariaLabel, ariaLabelledby]);

  // Keep the highlighted option in view.
  useEffect(() => {
    if (!open || active < 0) return;
    document.getElementById(optionId(active))?.scrollIntoView({ block: "nearest" });
    // optionId is stable for a given trigger id
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active]);

  const move = (list: SelectOption[], delta: number) => {
    if (!list.length) return;
    let i = active;
    for (let n = 0; n < list.length; n++) {
      i = Math.min(list.length - 1, Math.max(0, i + delta));
      if (!list[i].disabled) return setActive(i);
      if (i === 0 || i === list.length - 1) break;
    }
  };

  const jumpByText = (ch: string) => {
    const now = Date.now();
    const t = typeahead.current;
    t.text = now - t.at > 700 ? ch : t.text + ch;
    t.at = now;
    const start = Math.max(0, active);
    const order = [...options.slice(start + (t.text.length === 1 ? 1 : 0)), ...options];
    const hit = order.find((o) => !o.disabled && o.label.toLowerCase().startsWith(t.text.toLowerCase()));
    if (hit) {
      const idx = options.indexOf(hit);
      if (open) setActive(idx);
      else choose(hit);
    }
  };

  const onListKeys = (e: KeyboardEvent) => {
    const list = visible;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        move(list, 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        move(list, -1);
        break;
      case "PageDown":
        e.preventDefault();
        move(list, 8);
        break;
      case "PageUp":
        e.preventDefault();
        move(list, -8);
        break;
      case "Home":
        if (withSearch) break;
        e.preventDefault();
        setActive(firstEnabled(list));
        break;
      case "End":
        if (withSearch) break;
        e.preventDefault();
        setActive(firstEnabled(list, list.length - 1, -1));
        break;
      case "Enter":
        e.preventDefault();
        choose(list[active]);
        break;
      case " ":
        if (withSearch) break;
        e.preventDefault();
        choose(list[active]);
        break;
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        close();
        break;
      case "Tab":
        close(false);
        break;
      default:
        if (!withSearch && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) jumpByText(e.key);
    }
  };

  const onTriggerKeys = (e: KeyboardEvent) => {
    if (open) return onListKeys(e);
    if (["ArrowDown", "Enter", " "].includes(e.key)) {
      e.preventDefault();
      openList();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      openList();
    } else if (e.key === "Home") {
      e.preventDefault();
      openList("first");
    } else if (e.key === "End") {
      e.preventDefault();
      openList("last");
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (withSearch) {
        openList();
        setQuery(e.key);
        e.preventDefault();
      } else {
        jumpByText(e.key);
      }
    }
  };

  const pad = size === "sm" ? "py-1.5" : "py-2";
  const shape = variant === "pill" ? "rounded-full px-4 font-medium" : "rounded-lg px-3";
  const border = invalid ? BRAND.scoreLow : open ? BRAND.teal : BRAND.inputBorder;
  const triggerStyle: CSSProperties = {
    border: `1px solid ${border}`,
    color: selected ? BRAND.text : BRAND.textSubtle,
    boxShadow: open ? `0 0 0 3px ${BRAND.tealLight}` : undefined,
  };

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && !withSearch && active >= 0 ? optionId(active) : undefined}
        aria-required={required || undefined}
        aria-invalid={invalid || undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onTriggerKeys}
        className={`group w-full flex items-center justify-between gap-2 bg-white text-sm text-left outline-none transition ${pad} ${shape} hover:brightness-[0.98] focus-visible:ring-[3px] focus-visible:ring-[#CCFBF1] disabled:opacity-60 disabled:cursor-not-allowed`}
        style={triggerStyle}
      >
        <span className="truncate">{selected ? selected.label : placeholder}</span>
        <ChevronDown
          size={16}
          className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          style={{ color: open ? BRAND.teal : BRAND.textMuted }}
          aria-hidden
        />
      </button>

      {(name || required) && (
        <input
          tabIndex={-1}
          aria-hidden
          name={name}
          required={required}
          value={current}
          onChange={() => {}}
          onInvalid={(e) => {
            e.preventDefault();
            setInvalid(true);
            triggerRef.current?.focus();
          }}
          className="absolute inset-0 w-full h-full opacity-0 pointer-events-none"
        />
      )}
      {invalid && (
        <p className="mt-1 text-xs" style={{ color: BRAND.scoreLow }}>
          Please choose an option.
        </p>
      )}

      {open &&
        place &&
        createPortal(
          <div
            className="fixed z-[70] rounded-xl bg-white overflow-hidden flex flex-col"
            style={{
              top: place.top,
              bottom: place.bottom,
              left: place.left,
              width: place.width,
              maxHeight: place.maxHeight,
              border: `1px solid ${BRAND.cardBorder}`,
              boxShadow: "0 12px 32px -8px rgba(15, 23, 42, 0.22), 0 2px 6px rgba(15, 23, 42, 0.06)",
            }}
          >
            {withSearch && (
              <div className="p-2 border-b" style={{ borderColor: BRAND.cardBorder }}>
                <div
                  className="flex items-center gap-2 rounded-lg px-2.5 py-1.5"
                  style={{ backgroundColor: BRAND.subtleBg }}
                >
                  <Search size={14} style={{ color: BRAND.textMuted }} aria-hidden />
                  <input
                    ref={searchRef}
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setActive(0);
                    }}
                    onKeyDown={onListKeys}
                    placeholder={searchPlaceholder}
                    role="searchbox"
                    aria-controls={listId}
                    aria-activedescendant={active >= 0 ? optionId(active) : undefined}
                    aria-label="Filter options"
                    className="w-full bg-transparent text-sm outline-none"
                    style={{ color: BRAND.text }}
                  />
                </div>
              </div>
            )}
            <ul
              ref={listRef}
              id={listId}
              role="listbox"
              aria-labelledby={aria["aria-labelledby"] ?? triggerId}
              tabIndex={-1}
              className="overflow-y-auto py-1 overscroll-contain"
            >
              {visible.length === 0 && (
                <li className="px-3 py-2 text-sm" style={{ color: BRAND.textMuted }}>
                  No matches
                </li>
              )}
              {visible.map((o, i) => {
                const isSel = o.value === current;
                const isActive = i === active;
                return (
                  <li
                    key={`${o.value}-${i}`}
                    id={optionId(i)}
                    role="option"
                    aria-selected={isSel}
                    aria-disabled={o.disabled || undefined}
                    onPointerMove={() => !o.disabled && active !== i && setActive(i)}
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => choose(o)}
                    className="mx-1 px-2.5 py-2 rounded-lg text-sm flex items-start gap-2 select-none"
                    style={{
                      backgroundColor: isActive && !o.disabled ? BRAND.subtleBg : undefined,
                      color: o.disabled ? BRAND.textSubtle : isSel ? BRAND.tealDark : BRAND.text,
                      cursor: o.disabled ? "not-allowed" : "pointer",
                      fontWeight: isSel ? 600 : 400,
                    }}
                  >
                    <span className="flex-1 min-w-0">
                      <span className="block truncate">{o.label}</span>
                      {o.hint && (
                        <span className="block truncate text-xs font-normal" style={{ color: BRAND.textMuted }}>
                          {o.hint}
                        </span>
                      )}
                    </span>
                    {isSel && <Check size={15} className="shrink-0 mt-0.5" style={{ color: BRAND.teal }} aria-hidden />}
                  </li>
                );
              })}
            </ul>
          </div>,
          document.body,
        )}
    </div>
  );
}
