"use client";
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function WorkArea({
  children,
  inspector,
}: {
  children: ReactNode;
  inspector?: ReactNode;
}) {
  return (
    <div className="workspace-layout" data-inspector-open={!!inspector}>
      <div className="workspace-content">{children}</div>
      {inspector}
    </div>
  );
}
const subscribeMobile = (callback: () => void) => {
  const media = window.matchMedia("(max-width: 1000px)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
};

export function Inspector({
  title,
  titleClassName = "text-ui-section",
  onClose,
  children,
}: {
  title: string;
  titleClassName?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const mobile = useSyncExternalStore(
    subscribeMobile,
    () => window.matchMedia("(max-width: 1000px)").matches,
    () => false,
  );
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const overflow = document.body.style.overflow;
    if (mobile) document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [mobile]);
  return (
    <aside
      ref={panel}
      tabIndex={-1}
      role={mobile ? "dialog" : "complementary"}
      aria-modal={mobile || undefined}
      aria-label={title}
      className="workspace-inspector"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
        if (mobile && event.key === "Tab") {
          const elements = panel.current?.querySelectorAll<HTMLElement>(
            'a[href],button:not(:disabled),input:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]',
          );
          const first = elements?.[0],
            last = elements?.[elements.length - 1];
          if (
            event.shiftKey &&
            (document.activeElement === first ||
              document.activeElement === panel.current)
          ) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <h2
          className={`min-w-0 tracking-[-0.03em] break-words ${titleClassName}`}
        >
          {title}
        </h2>
        <Button
          size="sm"
          variant="ghost"
          className="shrink-0 px-2"
          aria-label="Close details"
          onClick={onClose}
        >
          <X className="size-5!" aria-hidden />
        </Button>
      </div>
      {children}
    </aside>
  );
}
