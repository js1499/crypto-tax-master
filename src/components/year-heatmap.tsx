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
  const [width, setWidth] = useState(800);
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
    if (!svgRef.current || weeklyActivity.length === 0) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // Determine the time range from the data itself
    const dates = weeklyActivity.map(w => new Date(w.weekStart)).sort((a, b) => a.getTime() - b.getTime());
    const dataStart = dates[0];
    const dataEnd = dates[dates.length - 1];

    // If a specific year is selected, scope to that year
    let rangeStart: Date;
    let rangeEnd: Date;
    if (year) {
      rangeStart = new Date(year, 0, 1);
      rangeEnd = new Date(year, 11, 31);
    } else {
      rangeStart = new Date(dataStart);
      rangeEnd = new Date(dataEnd);
    }

    // Total duration in ms
    const totalMs = rangeEnd.getTime() - rangeStart.getTime();
    const totalDays = Math.max(1, Math.ceil(totalMs / (1000 * 60 * 60 * 24)));

    // Fixed number of buckets (52), each covering an equal portion of the range
    const numBuckets = 52;
    const bucketMs = totalMs / numBuckets;

    // Build a map from week data
    const dataMap = new Map<number, { count: number; netGL: number }>();
    weeklyActivity.forEach(w => {
      const t = new Date(w.weekStart).getTime();
      const existing = dataMap.get(t);
      if (existing) {
        existing.count += w.count;
        existing.netGL += w.netGainLoss;
      } else {
        dataMap.set(t, { count: w.count, netGL: w.netGainLoss });
      }
    });

    // Aggregate data into buckets
    const buckets: Array<{ startDate: Date; endDate: Date; count: number; netGL: number }> = [];
    for (let i = 0; i < numBuckets; i++) {
      const bStart = new Date(rangeStart.getTime() + i * bucketMs);
      const bEnd = new Date(rangeStart.getTime() + (i + 1) * bucketMs);
      let count = 0;
      let netGL = 0;

      // Sum all data points that fall within this bucket
      dataMap.forEach((val, timestamp) => {
        if (timestamp >= bStart.getTime() && timestamp < bEnd.getTime()) {
          count += val.count;
          netGL += val.netGL;
        }
      });

      buckets.push({ startDate: bStart, endDate: bEnd, count, netGL });
    }

    // Layout — full width, no left margin
    const cellGap = 3;
    const cellSize = (width - (numBuckets - 1) * cellGap) / numBuckets;
    const r = Math.min(4, cellSize / 3);

    // Color scales
    const maxCount = Math.max(...buckets.map(b => b.count), 1);
    const maxAbsGL = Math.max(...buckets.map(b => Math.abs(b.netGL)), 1);

    const g = svg.append("g");

    // Draw cells
    buckets.forEach((bucket, i) => {
      const x = i * (cellSize + cellGap);
      let fill: string;
      let fillOpacity: number;

      if (mode === "volume") {
        if (bucket.count === 0) {
          fill = "#E5E5E0";
          fillOpacity = 1;
        } else {
          fill = "#2563EB";
          fillOpacity = 0.15 + (bucket.count / maxCount) * 0.85;
        }
      } else {
        if (bucket.netGL === 0 && bucket.count === 0) {
          fill = "#E5E5E0";
          fillOpacity = 1;
        } else if (bucket.netGL >= 0) {
          fill = "#16A34A";
          fillOpacity = bucket.count === 0 ? 1 : 0.2 + (Math.abs(bucket.netGL) / maxAbsGL) * 0.8;
          if (bucket.netGL === 0 && bucket.count > 0) { fill = "#E5E5E0"; fillOpacity = 1; }
        } else {
          fill = "#DC2626";
          fillOpacity = 0.2 + (Math.abs(bucket.netGL) / maxAbsGL) * 0.8;
        }
      }

      g.append("rect")
        .attr("x", x)
        .attr("y", 0)
        .attr("width", cellSize)
        .attr("height", cellSize)
        .attr("rx", r)
        .attr("fill", fill)
        .attr("opacity", fillOpacity)
        .attr("cursor", "pointer")
        .on("mouseenter", (event: MouseEvent) => {
          const startStr = bucket.startDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: totalDays > 400 ? "numeric" : undefined });
          const glText = bucket.netGL !== 0 ? ` · ${bucket.netGL >= 0 ? "+" : "-"}$${Math.abs(bucket.netGL).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "";
          setTooltip({
            x: event.clientX,
            y: event.clientY,
            text: `${startStr}: ${bucket.count} txns${glText}`,
          });
        })
        .on("mousemove", (event: MouseEvent) => {
          setTooltip(prev => prev ? { ...prev, x: event.clientX, y: event.clientY } : null);
        })
        .on("mouseleave", () => setTooltip(null));
    });

    // Month labels — show when a new month starts
    let lastMonth = -1;
    let lastYear = -1;
    buckets.forEach((bucket, i) => {
      const m = bucket.startDate.getMonth();
      const y = bucket.startDate.getFullYear();
      if (m !== lastMonth) {
        lastMonth = m;
        const x = i * (cellSize + cellGap) + cellSize / 2;
        // Show year on first label if multi-year, or on Jan
        const showYear = (totalDays > 400 && y !== lastYear) || m === 0;
        lastYear = y;
        const label = showYear && totalDays > 400 ? `${MONTHS[m]} '${String(y).slice(2)}` : MONTHS[m];
        g.append("text")
          .attr("x", x)
          .attr("y", cellSize + 14)
          .attr("text-anchor", "middle")
          .attr("font-size", "9px")
          .attr("font-weight", "500")
          .attr("fill", "#9CA3AF")
          .text(label);
      }
    });

  }, [weeklyActivity, width, mode, year]);

  // Compute cell size for SVG height
  const numBuckets = 52;
  const cellGap = 3;
  const cellSize = (width - (numBuckets - 1) * cellGap) / numBuckets;
  const svgHeight = cellSize + 20;

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="flex items-center gap-3 mb-2">
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
