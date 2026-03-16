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
  totalIncome?: number;
}

// Horizon pill text colors, arranged chromatically (warm → cool → warm)
const PALETTE = [
  "#9333EA", // purple
  "#4F46E5", // indigo
  "#2563EB", // blue
  "#0D9488", // teal
  "#16A34A", // green
  "#CA8A04", // yellow
  "#EA580C", // orange
  "#DB2777", // pink
  "#DC2626", // red
];
const OTHER_COLOR = "#4B5563"; // gray

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

// 10 subtle shade variations per color — minor differences between each
const GAIN_SHADES = [
  "#15803D", "#16A34A", "#1AAE52", "#1EB85A", "#22C55E",
  "#2DD264", "#38D96C", "#4ADE80", "#5BE38A", "#6EE898",
];
const LOSS_SHADES = [
  "#B91C1C", "#C52222", "#DC2626", "#E33030", "#EF4444",
  "#F14E4E", "#F25858", "#F46464", "#F56E6E", "#F87171",
];

function getBarSegmentColor(rowLabel: string, index: number = 0): string {
  if (rowLabel === "GAINS") return GAIN_SHADES[index % GAIN_SHADES.length];
  if (rowLabel === "LOSSES") return LOSS_SHADES[index % LOSS_SHADES.length];
  return "#16A34A";
}

export function PnLBreakdownChart({ gainsByAsset, lossesByAsset, netGain, totalIncome = 0 }: PnLBreakdownChartProps) {
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
    const bh = 36;       // bar height
    const gap = 16;      // gap between bars
    const r = 8;         // corner radius
    const cw = width - ml - mr; // chart width

    const cg = capItems(gainsByAsset);
    const cl = capItems(lossesByAsset);
    const tg = cg.reduce((s, a) => s + a.amount, 0);
    const tl = cl.reduce((s, a) => s + a.amount, 0);
    const mx = Math.max(tg, tl, totalIncome, Math.abs(netGain), 1);
    const sc = d3.scaleLinear().domain([0, mx]).range([0, cw]);

    const rows = [
      { label: "GAINS", items: cg, total: tg, color: "#16A34A", sign: "+" },
      { label: "LOSSES", items: cl, total: tl, color: "#DC2626", sign: "-" },
      ...(totalIncome > 0 ? [{ label: "INCOME", items: [] as AssetAmount[], total: totalIncome, color: "#2563EB", sign: "+" }] : []),
      { label: "NET", items: [] as AssetAmount[], total: Math.abs(netGain + totalIncome), color: (netGain + totalIncome) >= 0 ? "#16A34A" : "#DC2626", sign: (netGain + totalIncome) >= 0 ? "+" : "-" },
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
        .attr("rx", r).attr("fill", document.documentElement.classList.contains("dark") ? "#2A2A2A" : "#F0F0EB");

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
        const segGap = 3; // gap between segments
        let xAcc = ml;
        const segments: Array<{ x: number; w: number; color: string; asset: string; amount: number; idx: number }> = [];

        row.items.forEach((item, i) => {
          const sw = row.total > 0 ? (item.amount / row.total) * bw : 0;
          if (sw < 2) return;
          segments.push({ x: xAcc, w: sw, color: getBarSegmentColor(row.label, i), asset: item.asset, amount: item.amount, idx: i });
          xAcc += sw;
        });

        // Adjust widths to account for gaps between segments
        const totalGaps = Math.max(0, segments.length - 1) * segGap;
        const scaleFactor = segments.length > 1 ? (bw - totalGaps) / bw : 1;
        let xPos = ml;
        segments.forEach((seg, si) => {
          seg.x = xPos;
          seg.w = seg.w * scaleFactor;
          xPos += seg.w + (si < segments.length - 1 ? segGap : 0);
        });

        // Draw segments front-to-back (first segment drawn last so it's on top at the left edge)
        // Actually, draw left-to-right but use a clip on each to handle rounding
        segments.forEach((seg, si) => {
          // Every segment gets rounded corners since they're separated by gaps
          const rect = svg.append("rect")
            .attr("x", seg.x)
            .attr("y", y)
            .attr("width", 0)
            .attr("height", bh)
            .attr("rx", r)
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
  }, [gainsByAsset, lossesByAsset, netGain, totalIncome, width]);

  const numBars = totalIncome > 0 ? 4 : 3;
  const totalHeight = 36 * numBars + 16 * (numBars - 1);

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
