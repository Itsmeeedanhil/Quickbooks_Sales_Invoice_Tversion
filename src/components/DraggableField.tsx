import React, { useRef, useState } from "react";
import { GripVertical } from "lucide-react";
import { LayoutOffsetsMap } from "../types";

export interface DraggableFieldProps {
  fieldKey: string;
  label: string;
  baseLeft: number;
  baseTop: number;
  width?: number;
  height?: number;
  style?: React.CSSProperties;
  adjustMode: boolean;
  selectedField: string;
  onSelectField: (fieldKey: string) => void;
  offsets: LayoutOffsetsMap;
  onUpdateOffset: (fieldKey: string, dx: number, dy: number, announcement?: string) => void;
  zoom: number;
  children: React.ReactNode;
}

const SHEET_WIDTH = 850;
const SHEET_HEIGHT = 1100;

export const DraggableField: React.FC<DraggableFieldProps> = ({
  fieldKey,
  label,
  baseLeft,
  baseTop,
  width,
  height,
  style,
  adjustMode,
  selectedField,
  onSelectField,
  offsets,
  onUpdateOffset,
  zoom,
  children,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{
    startClientX: number;
    startClientY: number;
    initialDx: number;
    initialDy: number;
  } | null>(null);

  const pageOffset = offsets["__page__"] || { dx: 0, dy: 0 };
  const fieldOffset = offsets[fieldKey] || { dx: 0, dy: 0 };

  const clampOffset = (rawDx: number, rawDy: number) => {
    const minDx = -baseLeft - pageOffset.dx;
    const maxDx = SHEET_WIDTH - 40 - baseLeft - pageOffset.dx;
    const minDy = -baseTop - pageOffset.dy;
    const maxDy = SHEET_HEIGHT - 20 - baseTop - pageOffset.dy;

    return {
      dx: Math.round(Math.max(minDx, Math.min(rawDx, maxDx))),
      dy: Math.round(Math.max(minDy, Math.min(rawDy, maxDy))),
    };
  };

  const finalLeft = baseLeft + pageOffset.dx + fieldOffset.dx;
  const finalTop = baseTop + pageOffset.dy + fieldOffset.dy;
  const isSelected = adjustMode && selectedField === fieldKey;

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    onSelectField(fieldKey);
    dragStartRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      initialDx: fieldOffset.dx,
      initialDy: fieldOffset.dy,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId) || !dragStartRef.current) {
      return;
    }
    const deltaX = (e.clientX - dragStartRef.current.startClientX) / (zoom || 1);
    const deltaY = (e.clientY - dragStartRef.current.startClientY) / (zoom || 1);
    if (!isDragging && Math.hypot(deltaX, deltaY) > 3) {
      setIsDragging(true);
    }
    const clamped = clampOffset(
      dragStartRef.current.initialDx + deltaX,
      dragStartRef.current.initialDy + deltaY
    );
    onUpdateOffset(fieldKey, clamped.dx, clamped.dy);
  };

  const handleLostPointerCapture = () => {
    if (isDragging) {
      onUpdateOffset(
        fieldKey,
        fieldOffset.dx,
        fieldOffset.dy,
        `${label} repositioned`
      );
    }
    setIsDragging(false);
    dragStartRef.current = null;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const step = e.shiftKey ? 10 : 1;
    let nextDx = fieldOffset.dx;
    let nextDy = fieldOffset.dy;
    let dir = "";

    if (e.key === "ArrowLeft") {
      nextDx -= step;
      dir = "moved left";
    } else if (e.key === "ArrowRight") {
      nextDx += step;
      dir = "moved right";
    } else if (e.key === "ArrowUp") {
      nextDy -= step;
      dir = "moved up";
    } else if (e.key === "ArrowDown") {
      nextDy += step;
      dir = "moved down";
    } else {
      return;
    }

    e.preventDefault();
    onSelectField(fieldKey);
    const clamped = clampOffset(nextDx, nextDy);
    onUpdateOffset(fieldKey, clamped.dx, clamped.dy, `${label} ${dir}`);
  };

  return (
    <div
      className={`draggable-field-container ${adjustMode ? "adjust-active" : ""} ${
        isSelected ? "adjust-selected" : ""
      }`}
      onClick={() => {
        if (adjustMode) onSelectField(fieldKey);
      }}
      style={{
        position: "absolute",
        left: finalLeft,
        top: finalTop,
        width,
        height,
        ...style,
      }}
    >
      {adjustMode && (
        <button
          type="button"
          className={`drag-handle no-print ${isDragging ? "dragging" : ""}`}
          aria-label={`${label} handle. Use arrow keys to move.`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onLostPointerCapture={handleLostPointerCapture}
          onKeyDown={handleKeyDown}
        >
          <GripVertical size={11} />
          <span className="drag-handle-text">
            {label}
            {fieldOffset.dx !== 0 || fieldOffset.dy !== 0
              ? ` (${fieldOffset.dx >= 0 ? "+" : ""}${fieldOffset.dx}, ${
                  fieldOffset.dy >= 0 ? "+" : ""
                }${fieldOffset.dy})`
              : ""}
          </span>
        </button>
      )}
      {children}
    </div>
  );
};
