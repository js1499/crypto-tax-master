"use client";

import { useRef, useEffect, useState } from "react";
import * as d3 from "d3";

interface AssetAmount {
  asset: string;
  amount: number;
}

interface PnLBreakdownChartProps {
  gainsByAsset: AssetAmount[];
  lossesByAsset: AssetAmount[];
  netGain: number;
}

// 9 curated colors: distinct but harmonious, not rainbow
const PALETTE = [
  "#2563EB", // blue
  "#9333EA", // purple
  "#EA580C", // orange
  "#0D9488", // teal
  "#DC2626", // red
  "#CA8A04", // amber
  "#4F46E5", // indigo
  "#16A34A", // green
  "#DB2777", // pink
];
const OTHER_COLOR = "#9CA3AF"; // gray for "Other"

// Cap items at 9, roll the rest into "Other"
function capItems(items: AssetAmount[]): AssetAmount[] {
  if (items.length <= 9) return items;
  const top = items.slice(0, 9);
  const rest = items.slice(9);
  const otherAmount = rest.reduce((s, a) => s + a.amount, 0);
  if (otherAmount > 0) top.push({ asset: "Other", amount: otherAmount });
  return top;
}

function getColor(asset: string, index: number): string {
  if (asset === "Other") return OTHER_COLOR;
  return PALETTE[index % PALETTE.length];
}

export function PnLBreakdownChart({ gainsByAsset, lossesByAsset, netGain }: PnLBreakdownChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string; color: string } | null>(null);

  // Responsive width
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const margin = { left: 56, right: 100 };
    const barHeight = 32;
    const barGap = 14;
    const barRadius = 8;
    const chartWidth = width - margin.left - margin.right;

    const cappedGains = capItems(gainsByAsset);
    const cappedLosses = capItems(lossesByAsset);
    const totalGains = cappedGains.reduce((s, a) => s + a.amount, 0);
    const totalLosses = cappedLosses.reduce((s, a) => s + a.amount, 0);
    const maxVal = Math.max(totalGains, totalLosses, Math.abs(netGain), 1);

    const scale = d3.scaleLinear().domain([0, maxVal]).range([0, chartWidth]);

    const rows = [
      { label: "GAINS", items: cappedGains, total: totalGains, color: "#16A34A", sign: "+" },
      { label: "LOSSES", items: cappedLosses, total: totalLosses, color: "#DC2626", sign: "-" },
      { label: "NET", items: [] as AssetAmount[], total: Math.abs(netGain), color: netGain >= 0 ? "#16A34A" : "#DC2626", sign: netGain >= 0 ? "+" : "-" },
    ];

    const g = svg.append("g");

    rows.forEach((row, rowIdx) => {
      const y = rowIdx * (barHeight + barGap);

      // Row label
      g.append("text")
        .attr("x", margin.left - 10)
        .attr("y", y + barHeight / 2)
        .attr("text-anchor", "end")
        .attr("dominant-baseline", "central")
        .attr("font-size", "11px")
        .attr("font-weight", "600")
        .attr("fill", "#6B7280")
        .attr("letter-spacing", "0.05em")
        .text(row.label);

      // Bar background track
      g.append("rect")
        .attr("x", margin.left)
        .attr("y", y)
        .attr("width", chartWidth)
        .attr("height", barHeight)
        .attr("rx", barRadius)
        .attr("fill", "#F5F5F0")
        .attr("class", "dark-track");

      if (row.label === "NET") {
        // Solid net bar with animated entrance
        const barW = scale(row.total);
        g.append("rect")
          .attr("x", margin.left)
          .attr("y", y)
          .attr("width", 0)
          .attr("height", barHeight)
          .attr("rx", barRadius)
          .attr("fill", row.color)
          .attr("opacity", 0.85)
          .transition()
          .duration(800)
          .ease(d3.easeCubicOut)
          .attr("width", barW);
      } else {
        // Segmented bar with clip-path for consistent rounding
        const barTotalWidth = scale(row.total);
        const clipId = `clip-${row.label}-${rowIdx}`;

        // Define clip path as a rounded rect
        const defs = svg.select("defs").empty() ? svg.append("defs") : svg.select("defs");
        defs.append("clipPath")
          .attr("id", clipId)
          .append("rect")
          .attr("x", margin.left)
          .attr("y", y)
          .attr("width", barTotalWidth)
          .attr("height", barHeight)
          .attr("rx", barRadius);

        const barGroup = g.append("g").attr("clip-path", `url(#${clipId})`);
        let xOffset = margin.left;

        row.items.forEach((item, i) => {
          const segWidth = row.total > 0 ? (item.amount / row.total) * barTotalWidth : 0;
          if (segWidth < 1) return;

          const color = getColor(item.asset, i);

          const rect = barGroup.append("rect")
            .attr("x", xOffset)
            .attr("y", y)
            .attr("width", 0)
            .attr("height", barHeight)
            .attr("fill", color)
            .attr("opacity", 0.9)
            .attr("cursor", "pointer")
            .on("mouseenter", (event: MouseEvent) => {
              d3.select(event.target as Element).attr("opacity", 1);
              const pct = ((item.amount / row.total) * 100).toFixed(1);
              setTooltip({
                x: event.clientX,
                y: event.clientY,
                text: `${item.asset}: $${item.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })} (${pct}%)`,
                color,
              });
            })
            .on("mouseleave", (event: MouseEvent) => {
              d3.select(event.target as Element).attr("opacity", 0.9);
              setTooltip(null);
            });

          // Animate entrance with stagger
          rect.transition()
            .duration(600)
            .delay(i * 40 + rowIdx * 100)
            .ease(d3.easeCubicOut)
            .attr("width", segWidth);

          // Asset label inside segment if wide enough
          if (segWidth > 36) {
            g.append("text")
              .attr("x", xOffset + segWidth / 2)
              .attr("y", y + barHeight / 2)
              .attr("text-anchor", "middle")
              .attr("dominant-baseline", "central")
              .attr("font-size", "10px")
              .attr("font-weight", "600")
              .attr("fill", "white")
              .attr("pointer-events", "none")
              .attr("opacity", 0)
              .text(item.asset)
              .transition()
              .duration(400)
              .delay(i * 40 + rowIdx * 100 + 300)
              .attr("opacity", 1);
          }

          xOffset += segWidth;
        });
      }

      // Dollar total on the right
      g.append("text")
        .attr("x", width - 4)
        .attr("y", y + barHeight / 2)
        .attr("text-anchor", "end")
        .attr("dominant-baseline", "central")
        .attr("font-size", "12px")
        .attr("font-weight", "600")
        .attr("fill", row.color)
        .style("font-variant-numeric", "tabular-nums")
        .attr("opacity", 0)
        .text(`${row.sign}$${row.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}`)
        .transition()
        .duration(500)
        .delay(rowIdx * 150 + 200)
        .attr("opacity", 1);
    });

  }, [gainsByAsset, lossesByAsset, netGain, width]);

  const totalHeight = 32 * 3 + 14 * 2; // 3 bars + 2 gaps

  return (
    <div ref={containerRef} className="relative w-full">
      <svg
        ref={svgRef}
        width={width}
        height={totalHeight}
        className="overflow-visible"
      />
      {tooltip && (
        <div
          className="fixed z-50 px-2.5 py-1.5 rounded-md text-[11px] font-medium text-white shadow-md pointer-events-none"
          style={{
            left: tooltip.x + 12,
            top: tooltip.y - 8,
            backgroundColor: tooltip.color,
          }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}
