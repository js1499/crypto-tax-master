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

    const dates = weeklyActivity.map(w => new Date(w.weekStart)).sort((a, b) => a.getTime() - b.getTime());
    const dataStart = dates[0];
    const dataEnd = dates[dates.length - 1];

    let rangeStart: Date, rangeEnd: Date;
    if (year) {
      rangeStart = new Date(year, 0, 1);
      rangeEnd = new Date(year, 11, 31);
    } else {
      rangeStart = new Date(dataStart);
      rangeEnd = new Date(dataEnd);
    }

    const totalMs = rangeEnd.getTime() - rangeStart.getTime();
    const totalDays = Math.max(1, Math.ceil(totalMs / (1000 * 60 * 60 * 24)));
    const numBuckets = 52;
    const bucketMs = totalMs / numBuckets;

    const dataMap = new Map<number, { count: number; netGL: number }>();
    weeklyActivity.forEach(w => {
      const t = new Date(w.weekStart).getTime();
      const existing = dataMap.get(t);
      if (existing) { existing.count += w.count; existing.netGL += w.netGainLoss; }
      else dataMap.set(t, { count: w.count, netGL: w.netGainLoss });
    });

    const buckets: Array<{ startDate: Date; count: number; netGL: number }> = [];
    for (let i = 0; i < numBuckets; i++) {
      const bStart = new Date(rangeStart.getTime() + i * bucketMs);
      const bEnd = new Date(rangeStart.getTime() + (i + 1) * bucketMs);
      let count = 0, netGL = 0;
      dataMap.forEach((val, ts) => {
        if (ts >= bStart.getTime() && ts < bEnd.getTime()) { count += val.count; netGL += val.netGL; }
      });
      buckets.push({ startDate: bStart, count, netGL });
    }

    // Two rows: top = volume, bottom = P&L
    const cellGap = 3;
    const rowGap = 6;
    const cellW = (width - (numBuckets - 1) * cellGap) / numBuckets;
    const cellH = cellW; // square
    const r = Math.min(4, cellW / 3);

    const maxCount = Math.max(...buckets.map(b => b.count), 1);
    const maxAbsGL = Math.max(...buckets.map(b => Math.abs(b.netGL)), 1);

    const g = svg.append("g");

    buckets.forEach((bucket, i) => {
      const x = i * (cellW + cellGap);

      // Volume row (top)
      const volY = 0;
      let volFill: string, volOp: number;
      if (bucket.count === 0) { volFill = "#E5E5E0"; volOp = 1; }
      else { volFill = "#2563EB"; volOp = 0.15 + (bucket.count / maxCount) * 0.85; }

      g.append("rect")
        .attr("x", x).attr("y", volY)
        .attr("width", cellW).attr("height", cellH)
        .attr("rx", r).attr("fill", volFill).attr("opacity", volOp)
        .attr("cursor", "pointer")
        .on("mouseenter", (event: MouseEvent) => {
          const dateStr = bucket.startDate.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(totalDays > 400 ? { year: "numeric" } : {}) });
          setTooltip({ x: event.clientX, y: event.clientY, text: `${dateStr}: ${bucket.count} transactions` });
        })
        .on("mousemove", (event: MouseEvent) => setTooltip(prev => prev ? { ...prev, x: event.clientX, y: event.clientY } : null))
        .on("mouseleave", () => setTooltip(null));

      // P&L row (bottom)
      const pnlY = cellH + rowGap;
      let pnlFill: string, pnlOp: number;
      if (bucket.netGL === 0 && bucket.count === 0) { pnlFill = "#E5E5E0"; pnlOp = 1; }
      else if (bucket.netGL >= 0) {
        pnlFill = "#16A34A";
        pnlOp = bucket.netGL === 0 ? (bucket.count > 0 ? 0.1 : 1) : 0.2 + (Math.abs(bucket.netGL) / maxAbsGL) * 0.8;
        if (bucket.netGL === 0 && bucket.count === 0) { pnlFill = "#E5E5E0"; pnlOp = 1; }
      } else {
        pnlFill = "#DC2626";
        pnlOp = 0.2 + (Math.abs(bucket.netGL) / maxAbsGL) * 0.8;
      }

      g.append("rect")
        .attr("x", x).attr("y", pnlY)
        .attr("width", cellW).attr("height", cellH)
        .attr("rx", r).attr("fill", pnlFill).attr("opacity", pnlOp)
        .attr("cursor", "pointer")
        .on("mouseenter", (event: MouseEvent) => {
          const dateStr = bucket.startDate.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(totalDays > 400 ? { year: "numeric" } : {}) });
          const glText = bucket.netGL !== 0 ? `${bucket.netGL >= 0 ? "+" : "-"}$${Math.abs(bucket.netGL).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "$0";
          setTooltip({ x: event.clientX, y: event.clientY, text: `${dateStr}: ${glText}` });
        })
        .on("mousemove", (event: MouseEvent) => setTooltip(prev => prev ? { ...prev, x: event.clientX, y: event.clientY } : null))
        .on("mouseleave", () => setTooltip(null));
    });

    // Month labels below both rows
    const labelY = cellH * 2 + rowGap + 14;
    let lastMonth = -1;
    buckets.forEach((bucket, i) => {
      const m = bucket.startDate.getMonth();
      const y = bucket.startDate.getFullYear();
      if (m !== lastMonth) {
        lastMonth = m;
        const x = i * (cellW + cellGap) + cellW / 2;
        const label = totalDays > 400 ? `${MONTHS[m]} '${String(y).slice(2)}` : MONTHS[m];
        g.append("text")
          .attr("x", x).attr("y", labelY)
          .attr("text-anchor", "middle")
          .attr("font-size", "9px").attr("font-weight", "500").attr("fill", "#9CA3AF")
          .text(label);
      }
    });

    // Row labels on the right
    const labelX = width + 6;
    g.append("text")
      .attr("x", labelX).attr("y", cellH / 2)
      .attr("text-anchor", "start").attr("dominant-baseline", "central")
      .attr("font-size", "9px").attr("font-weight", "600").attr("fill", "#9CA3AF")
      .text("VOL");
    g.append("text")
      .attr("x", labelX).attr("y", cellH + rowGap + cellH / 2)
      .attr("text-anchor", "start").attr("dominant-baseline", "central")
      .attr("font-size", "9px").attr("font-weight", "600").attr("fill", "#9CA3AF")
      .text("P&L");

  }, [weeklyActivity, width, year]);

  const numBuckets = 52;
  const cellGap = 3;
  const cellW = (width - (numBuckets - 1) * cellGap) / numBuckets;
  const rowGap = 6;
  const svgHeight = cellW * 2 + rowGap + 20;

  return (
    <div ref={containerRef} className="relative w-full">
      <h2 className="text-[13px] font-semibold text-[#4B5563] tracking-wide uppercase mb-2">Activity</h2>
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
