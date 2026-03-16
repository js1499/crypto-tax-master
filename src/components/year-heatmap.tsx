"use client";

import { useRef, useEffect, useState } from "react";
import * as d3 from "d3";

interface WeekData {
  weekStart: string;
  count: number;
  netGainLoss: number;
}

interface YearHeatmapProps {
  weeklyActivity: WeekData[];
  year?: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function YearHeatmap({ weeklyActivity, year }: YearHeatmapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(700);
  const [mode, setMode] = useState<"volume" | "pnl">("volume");
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width);
    });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // Build 52 weeks for the year
    const targetYear = year || new Date().getFullYear();
    const weeks: Array<{ date: Date; count: number; netGL: number }> = [];

    // Create a map from week start date to data
    const dataMap = new Map<string, WeekData>();
    weeklyActivity.forEach(w => {
      const d = new Date(w.weekStart);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      dataMap.set(key, w);
    });

    // Generate all 52 weeks of the year
    const yearStart = new Date(targetYear, 0, 1);
    // Find the Monday of the first week
    const firstMonday = new Date(yearStart);
    firstMonday.setDate(firstMonday.getDate() - ((firstMonday.getDay() + 6) % 7));

    for (let i = 0; i < 53; i++) {
      const weekDate = new Date(firstMonday);
      weekDate.setDate(weekDate.getDate() + i * 7);
      if (weekDate.getFullYear() > targetYear && i > 0) break;

      // Find matching data (check within 3 days to handle timezone differences)
      let matched: WeekData | undefined;
      for (let offset = -3; offset <= 3; offset++) {
        const checkDate = new Date(weekDate);
        checkDate.setDate(checkDate.getDate() + offset);
        const key = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;
        if (dataMap.has(key)) {
          matched = dataMap.get(key);
          break;
        }
      }

      weeks.push({
        date: weekDate,
        count: matched?.count || 0,
        netGL: matched?.netGainLoss || 0,
      });
    }

    const ml = 0;
    const cellSize = Math.min(14, (width - ml) / 53 - 1);
    const cellGap = 2;
    const cellTotal = cellSize + cellGap;

    // Color scales
    const maxCount = Math.max(...weeks.map(w => w.count), 1);
    const maxAbsGL = Math.max(...weeks.map(w => Math.abs(w.netGL)), 1);

    const volumeScale = d3.scaleLinear()
      .domain([0, maxCount])
      .range([0, 1]);

    const g = svg.append("g").attr("transform", `translate(${ml}, 0)`);

    // Draw cells
    weeks.forEach((week, i) => {
      let fill: string;
      let opacity: number;

      if (mode === "volume") {
        const intensity = volumeScale(week.count);
        if (week.count === 0) {
          fill = "#E5E5E0";
          opacity = 1;
        } else {
          fill = "#2563EB";
          opacity = 0.15 + intensity * 0.85;
        }
      } else {
        // P&L mode
        if (week.netGL === 0 && week.count === 0) {
          fill = "#E5E5E0";
          opacity = 1;
        } else if (week.netGL >= 0) {
          fill = "#16A34A";
          opacity = 0.2 + (Math.abs(week.netGL) / maxAbsGL) * 0.8;
        } else {
          fill = "#DC2626";
          opacity = 0.2 + (Math.abs(week.netGL) / maxAbsGL) * 0.8;
        }
      }

      g.append("rect")
        .attr("x", i * cellTotal)
        .attr("y", 0)
        .attr("width", cellSize)
        .attr("height", cellSize)
        .attr("rx", 3)
        .attr("fill", fill)
        .attr("opacity", opacity)
        .attr("cursor", "pointer")
        .on("mouseenter", (event: MouseEvent) => {
          const weekOf = week.date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
          const glText = week.netGL !== 0 ? ` · ${week.netGL >= 0 ? "+" : "-"}$${Math.abs(week.netGL).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "";
          setTooltip({
            x: event.clientX,
            y: event.clientY,
            text: `Week of ${weekOf}: ${week.count} txns${glText}`,
          });
        })
        .on("mousemove", (event: MouseEvent) => {
          setTooltip(prev => prev ? { ...prev, x: event.clientX, y: event.clientY } : null);
        })
        .on("mouseleave", () => setTooltip(null));
    });

    // Month labels
    let lastMonth = -1;
    weeks.forEach((week, i) => {
      const month = week.date.getMonth();
      if (month !== lastMonth) {
        lastMonth = month;
        g.append("text")
          .attr("x", i * cellTotal + cellSize / 2)
          .attr("y", cellSize + 14)
          .attr("text-anchor", "middle")
          .attr("font-size", "9px")
          .attr("font-weight", "500")
          .attr("fill", "#9CA3AF")
          .text(MONTHS[month]);
      }
    });

  }, [weeklyActivity, width, mode, year]);

  const cellSize = Math.min(14, (width) / 53 - 1);
  const svgHeight = cellSize + 20; // cells + month labels

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-[13px] font-semibold text-[#4B5563] tracking-wide uppercase">Activity</h2>
        <div className="flex items-center gap-1 bg-[#F5F5F0] dark:bg-[#222222] rounded-md p-0.5">
          <button
            onClick={() => setMode("volume")}
            className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${mode === "volume" ? "bg-white dark:bg-[#333] text-[#1A1A1A] dark:text-[#F5F5F5] shadow-xs" : "text-[#6B7280]"}`}
          >
            Volume
          </button>
          <button
            onClick={() => setMode("pnl")}
            className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${mode === "pnl" ? "bg-white dark:bg-[#333] text-[#1A1A1A] dark:text-[#F5F5F5] shadow-xs" : "text-[#6B7280]"}`}
          >
            P&L
          </button>
        </div>
      </div>
      <svg ref={svgRef} width={width} height={svgHeight} className="overflow-visible" />
      {tooltip && (
        <div
          className="fixed z-50 px-2.5 py-1.5 rounded-md text-[11px] font-medium bg-[#1A1A1A] text-white shadow-md pointer-events-none"
          style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}
