import * as React from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css"; // ← important: restores correct calendar layout
import { cn } from "@/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ className, showOutsideDays = true, ...props }: CalendarProps) {
  // If parent passes a range selected prop ({ from, to }), map those to explicit modifiers
  // so we can apply classes only to the start/end boundary days.
  const selected = (props as any).selected;

  const modifiers = React.useMemo(() => {
    // keep any modifiers parent passed
    const base = (props as any).modifiers || {};
    if (selected && selected.from && selected.to) {
      return { ...base, rangeStart: selected.from, rangeEnd: selected.to };
    }
    // fallback: if parent passed a single Date as selected, do nothing special
    return base;
  }, [props, selected]);

  return (
    <div className={cn("p-3", className)}>
      <style>{`
        /* Make the middle of the selected range visible by setting DayPicker CSS variables */
        .rdp {
          --rdp-range_middle-background-color: rgba(168,85,247,0.10);
          --rdp-range_middle-hover-background-color: rgba(168,85,247,0.14);
        }

        /* Also directly style runtime middle-range cells if the library doesn't use the CSS vars. */
        td.rdp-range_middle,
        td.rdp-range_middle > button.rdp-day_button,
        .rdp-day.rdp-range_middle,
        button.rdp-day_button.rdp-range_middle {
          background: rgba(168,85,247,0.10) !important;
          color: #ffffff !important;
          border-radius: 0.25rem !important;
        }
        td.rdp-range_middle:hover > button.rdp-day_button,
        td.rdp-range_middle > button.rdp-day_button:hover,
        .rdp-day.rdp-range_middle:hover,
        button.rdp-day_button.rdp-range_middle:hover {
          background: rgba(168,85,247,0.14) !important;
        }

        /* [NEW] This resets the table cell (<td>) that holds the start/end button */
        td.custom-range-start,
        td.custom-range-end {
          border: none !important;
          outline: none !important;
          box-shadow: none !important;
          background: transparent !important;
        }

        /* Style only the start and end day cells that receive our custom modifier classes.
           We target the inner button so we don't change the appearance of intermediate range cells. */
        td.custom-range-start > button.rdp-day_button,
        td.custom-range-end > button.rdp-day_button,
        .custom-range-start > button.rdp-day_button,
        .custom-range-end > button.rdp-day_button,
        button.rdp-day_button.custom-range-start,
        button.rdp-day_button.custom-range-end {
          background: linear-gradient(90deg, #A855F7 0%, #F97316 100%) !important;
          color: #ffffff !important;
          border: none !important;
          border-radius: 0.375rem !important;
          font-weight: 500 !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 0.5rem !important;
          transition: transform 0.2s ease, box-shadow 0.2s ease !important;
          box-shadow: 0 4px 12px rgba(165, 85, 247, 0.12) !important;
        }
        td.custom-range-start > button.rdp-day_button:hover,
        td.custom-range-end > button.rdp-day_button:hover {
          transform: translateY(-2px) !important;
          box-shadow: 0 6px 18px rgba(165, 85, 247, 0.18) !important;
        }
        td.custom-range-start > button.rdp-day_button:focus,
        td.custom-range-end > button.rdp-day_button:focus {
          outline: none !important;
          box-shadow: 0 0 0 3px rgba(168,85,247,0.22) !important;
        }
      `}</style>

      <DayPicker
        showOutsideDays={showOutsideDays}
        // Pass through all props but ensure our modifiers and modifier class names map are merged
        {...props}
        modifiers={modifiers}
        modifiersClassNames={{
          // The keys here must match the keys we set on modifiers above.
          rangeStart: "custom-range-start",
          rangeEnd: "custom-range-end",
          ...(props as any).modifiersClassNames,
        }}
      />
    </div>
  );
}
Calendar.displayName = "Calendar";

export { Calendar };