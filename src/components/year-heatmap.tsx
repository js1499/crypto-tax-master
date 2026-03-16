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

    const totalDays = Math.max(1, Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24)));

    // Build monthly buckets from actual calendar months
    const buckets: Array<{ startDate: Date; endDate: Date; count: number; netGL: number; label: string }> = [];
    const startMonth = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
    let cursor = new Date(startMonth);
    while (cursor <= rangeEnd) {
      const bStart = new Date(cursor);
      const bEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59);
      buckets.push({
        startDate: bStart,
        endDate: bEnd,
        count: 0,
        netGL: 0,
        label: MONTHS[cursor.getMonth()] + (totalDays > 400 ? " '" + String(cursor.getFullYear()).slice(2) : ""),
      });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }

    // Aggregate weekly data into monthly buckets
    weeklyActivity.forEach(w => {
      const t = new Date(w.weekStart).getTime();
      for (const bucket of buckets) {
        if (t >= bucket.startDate.getTime() && t <= bucket.endDate.getTime()) {
          bucket.count += w.count;
          bucket.netGL += w.netGainLoss;
          break;
        }
      }
    });

    const numBuckets = buckets.length;

    // Two rows: top = volume, bottom = P&L
    const ml = 52;
    const cellGap = 4;
    const rowGap = 14;
    const chartW = width - ml;
    const cellW = (chartW - (numBuckets - 1) * cellGap) / numBuckets;
    const cellH = Math.min(cellW, 36);
    const r = Math.min(6, cellW / 4);

    const maxCount = Math.max(...buckets.map(b => b.count), 1);
    const maxAbsGL = Math.max(...buckets.map(b => Math.abs(b.netGL)), 1);

    const g = svg.append("g");

    buckets.forEach((bucket, i) => {
      const x = ml + i * (cellW + cellGap);

      // Volume row (top)
      let volFill: string, volOp: number;
      if (bucket.count === 0) { volFill = "#E5E5E0"; volOp = 1; }
      else { volFill = "#2563EB"; volOp = 0.15 + (bucket.count / maxCount) * 0.85; }

      g.append("rect")
        .attr("x", x).attr("y", 0)
        .attr("width", cellW).attr("height", cellH)
        .attr("rx", r).attr("fill", volFill).attr("opacity", volOp)
        .attr("cursor", "pointer")
        .on("mouseenter", (event: MouseEvent) => {
          setTooltip({ x: event.clientX, y: event.clientY, text: `${bucket.label}: ${bucket.count} transactions` });
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
          const glText = bucket.netGL !== 0 ? `${bucket.netGL >= 0 ? "+" : "-"}$${Math.abs(bucket.netGL).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "$0";
          setTooltip({ x: event.clientX, y: event.clientY, text: `${bucket.label}: ${glText}` });
        })
        .on("mousemove", (event: MouseEvent) => setTooltip(prev => prev ? { ...prev, x: event.clientX, y: event.clientY } : null))
        .on("mouseleave", () => setTooltip(null));

      // Month label below both rows
      g.append("text")
        .attr("x", x + cellW / 2)
        .attr("y", cellH * 2 + rowGap + 14)
        .attr("text-anchor", "middle")
        .attr("font-size", "9px").attr("font-weight", "500").attr("fill", "#9CA3AF")
        .text(bucket.label);
    });

    // Row labels on the left
    g.append("text")
      .attr("x", 0).attr("y", cellH / 2)
      .attr("text-anchor", "start").attr("dominant-baseline", "central")
      .attr("font-size", "11px").attr("font-weight", "600").attr("fill", "#6B7280")
      .attr("letter-spacing", "0.02em")
      .text("Volume");
    g.append("text")
      .attr("x", 0).attr("y", cellH + rowGap + cellH / 2)
      .attr("text-anchor", "start").attr("dominant-baseline", "central")
      .attr("font-size", "11px").attr("font-weight", "600").attr("fill", "#6B7280")
      .attr("letter-spacing", "0.02em")
      .text("P&L");

  }, [weeklyActivity, width, year]);

  // Compute height for SVG
  const numBucketsOuter = 12;
  const cellGapOuter = 4;
  const mlOuter = 52;
  const chartWOuter = width - mlOuter;
  const cellWOuter = (chartWOuter - (numBucketsOuter - 1) * cellGapOuter) / numBucketsOuter;
  const cellHOuter = Math.min(cellWOuter, 36);
  const rowGapOuter = 14;
  const svgHeight = cellHOuter * 2 + rowGapOuter + 20;

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="flex items-baseline gap-2 mb-2">
        <h2 className="text-[13px] font-semibold text-[#4B5563] tracking-wide uppercase">Activity</h2>
        {weeklyActivity.length > 0 && (() => {
          const dates = weeklyActivity.map(w => new Date(w.weekStart)).sort((a, b) => a.getTime() - b.getTime());
          const start = dates[0];
          const end = dates[dates.length - 1];
          const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
          return <span className="text-[11px] text-[#9CA3AF]">{fmt(start)} – {fmt(end)}</span>;
        })()}
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
