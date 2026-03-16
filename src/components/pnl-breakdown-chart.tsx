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

// Pill text colors from the Horizon design system — same colors used in transaction type tags
const PALETTE = [
  "#2563EB", // blue (pill-blue-text)
  "#9333EA", // purple (pill-purple-text)
  "#EA580C", // orange (pill-orange-text)
  "#0D9488", // teal (pill-teal-text)
  "#DC2626", // red (pill-red-text)
  "#CA8A04", // yellow (pill-yellow-text)
  "#4F46E5", // indigo (pill-indigo-text)
  "#16A34A", // green (pill-green-text)
  "#DB2777", // pink (pill-pink-text)
];
const OTHER_COLOR = "#4B5563"; // gray (pill-gray-text)

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
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(600);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string; color: string } | null>(null);

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

    const ml = 60;       // left margin for labels
    const mr = 100;      // right margin for totals
    const bh = 28;       // bar height
    const gap = 12;      // gap between bars
    const r = 6;         // corner radius
    const cw = width - ml - mr; // chart width

    const cg = capItems(gainsByAsset);
    const cl = capItems(lossesByAsset);
    const tg = cg.reduce((s, a) => s + a.amount, 0);
    const tl = cl.reduce((s, a) => s + a.amount, 0);
    const mx = Math.max(tg, tl, Math.abs(netGain), 1);
    const sc = d3.scaleLinear().domain([0, mx]).range([0, cw]);

    const rows = [
      { label: "GAINS", items: cg, total: tg, color: "#16A34A", sign: "+" },
      { label: "LOSSES", items: cl, total: tl, color: "#DC2626", sign: "-" },
      { label: "NET", items: [] as AssetAmount[], total: Math.abs(netGain), color: netGain >= 0 ? "#16A34A" : "#DC2626", sign: netGain >= 0 ? "+" : "-" },
    ];

    rows.forEach((row, ri) => {
      const y = ri * (bh + gap);
      const bw = sc(row.total);

      // Label
      svg.append("text")
        .attr("x", ml - 12)
        .attr("y", y + bh / 2)
        .attr("text-anchor", "end")
        .attr("dominant-baseline", "central")
        .attr("font-size", "11px")
        .attr("font-weight", "600")
        .attr("fill", "#6B7280")
        .attr("letter-spacing", "0.04em")
        .text(row.label);

      // Background track
      svg.append("rect")
        .attr("x", ml).attr("y", y)
        .attr("width", cw).attr("height", bh)
        .attr("rx", r).attr("fill", "#F0F0EB");

      if (row.label === "NET" || row.items.length === 0) {
        // Single solid bar
        svg.append("rect")
          .attr("x", ml).attr("y", y)
          .attr("width", 0).attr("height", bh)
          .attr("rx", r)
          .attr("fill", row.color).attr("opacity", 0.9)
          .transition().duration(700).delay(ri * 120)
          .ease(d3.easeCubicOut)
          .attr("width", bw);
      } else {
        // Segmented bar — each segment is its own rounded rect, overlapping slightly
        // so the visual corners are smooth. We draw back-to-front for proper layering.
        let xAcc = ml;
        const segments: Array<{ x: number; w: number; color: string; asset: string; amount: number; idx: number }> = [];

        row.items.forEach((item, i) => {
          const sw = row.total > 0 ? (item.amount / row.total) * bw : 0;
          if (sw < 0.5) return;
          segments.push({ x: xAcc, w: sw, color: getColor(item.asset, i), asset: item.asset, amount: item.amount, idx: i });
          xAcc += sw;
        });

        // Draw segments front-to-back (first segment drawn last so it's on top at the left edge)
        // Actually, draw left-to-right but use a clip on each to handle rounding
        segments.forEach((seg, si) => {
          const isFirst = si === 0;
          const isLast = si === segments.length - 1;
          const isOnly = segments.length === 1;

          // For proper rounding: first gets left-rounded, last gets right-rounded, only gets both
          // We achieve this by making the rect slightly wider and clipping
          const rect = svg.append("rect")
            .attr("x", seg.x)
            .attr("y", y)
            .attr("width", 0)
            .attr("height", bh)
            .attr("rx", isOnly ? r : isFirst || isLast ? r : 0)
            .attr("fill", seg.color)
            .attr("opacity", 0.9)
            .attr("cursor", "pointer")
            .on("mouseenter", function(event: MouseEvent) {
              d3.select(this).attr("opacity", 1);
              const pct = ((seg.amount / row.total) * 100).toFixed(1);
              setTooltip({
                x: event.clientX, y: event.clientY,
                text: `${seg.asset}: $${seg.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })} (${pct}%)`,
                color: seg.color,
              });
            })
            .on("mousemove", function(event: MouseEvent) {
              setTooltip(prev => prev ? { ...prev, x: event.clientX, y: event.clientY } : null);
            })
            .on("mouseleave", function() {
              d3.select(this).attr("opacity", 0.9);
              setTooltip(null);
            });

          rect.transition()
            .duration(500)
            .delay(seg.idx * 30 + ri * 100)
            .ease(d3.easeCubicOut)
            .attr("width", seg.w);

          // Label inside segment
          if (seg.w > 40) {
            svg.append("text")
              .attr("x", seg.x + seg.w / 2)
              .attr("y", y + bh / 2)
              .attr("text-anchor", "middle")
              .attr("dominant-baseline", "central")
              .attr("font-size", "10px")
              .attr("font-weight", "600")
              .attr("fill", "white")
              .attr("pointer-events", "none")
              .attr("opacity", 0)
              .text(seg.asset)
              .transition().duration(300)
              .delay(seg.idx * 30 + ri * 100 + 400)
              .attr("opacity", 1);
          }
        });
      }

      // Dollar total
      svg.append("text")
        .attr("x", width - 4)
        .attr("y", y + bh / 2)
        .attr("text-anchor", "end")
        .attr("dominant-baseline", "central")
        .attr("font-size", "13px")
        .attr("font-weight", "600")
        .attr("fill", row.color)
        .style("font-variant-numeric", "tabular-nums")
        .attr("opacity", 0)
        .text(`${row.sign}$${row.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}`)
        .transition().duration(400).delay(ri * 120 + 200)
        .attr("opacity", 1);
    });
  }, [gainsByAsset, lossesByAsset, netGain, width]);

  const totalHeight = 28 * 3 + 12 * 2;

  return (
    <div ref={containerRef} className="relative w-full">
      <svg ref={svgRef} width={width} height={totalHeight} className="overflow-visible" />
      {tooltip && (
        <div
          className="fixed z-50 px-2.5 py-1.5 rounded-md text-[11px] font-medium text-white shadow-md pointer-events-none"
          style={{ left: tooltip.x + 12, top: tooltip.y - 10, backgroundColor: tooltip.color }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}
