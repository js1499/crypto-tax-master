"use client";

import { useId, useRef } from "react";
import { BaseMark, CoinbaseMark, EthereumMark, HyperliquidMark, KrakenMark, SolanaMark } from "@/components/glide-landing/PlatformMarks";
import { CheckIcon } from "@/components/glide-landing/icons";
import { useWorkflowPlayback, type WorkflowTrack } from "./useWorkflowPlayback";
import styles from "./FilingWorkflowAnimation.module.css";

const storyDuration = 7_500;
const holdDuration = 3_500;
const resetDuration = 400;
const duration = storyDuration + holdDuration + resetDuration;
const resetStart = (storyDuration + holdDuration) / duration;
// Each of the three scenes gets 2.5 s of story; the finished reports then hold for 3.5 s more,
// so the download sits on screen for about six seconds before the loop restarts.
const storyboardSeconds = 24;
const ease = "cubic-bezier(0.4, 0, 0.2, 1)";
const offset = (seconds: number) => (seconds / storyboardSeconds) * (storyDuration / duration);

const accounts = [
  { name: "Coinbase", type: "Exchange", Mark: CoinbaseMark, activity: "USDC deposit", action: "Received", tone: "green", amount: "$1,284.60" },
  { name: "Hyperliquid", type: "Exchange", Mark: HyperliquidMark, activity: "HYPE perpetual", action: "Trade", tone: "coral", amount: "$842.15" },
  { name: "Kraken", type: "Exchange", Mark: KrakenMark, activity: "Staking reward", action: "Staked", tone: "amber", amount: "$36.42" },
  { name: "Solana", type: "Wallet", Mark: SolanaMark, activity: "SOL / USDC", action: "Swap", tone: "lilac", amount: "$274.80" },
  { name: "Ethereum", type: "Wallet", Mark: EthereumMark, activity: "ETH / USDC", action: "Swap", tone: "lilac", amount: "$1,956.30" },
  { name: "Base", type: "Wallet", Mark: BaseMark, activity: "USDC transfer", action: "Transfer", tone: "green", amount: "$560.00" },
] as const;

function reveal(selector: string, start: number, length = 0.444, scale?: number, resetAfterAccounts = false): WorkflowTrack {
  return {
    selector,
    keyframes: [
      { offset: 0, opacity: 0, ...(scale ? { transform: `scale(${scale})` } : {}) },
      { offset: offset(start), opacity: 0, ...(scale ? { transform: `scale(${scale})` } : {}), easing: ease },
      { offset: offset(start + length), opacity: 1, ...(scale ? { transform: "scale(1)" } : {}) },
      ...(resetAfterAccounts ? [
        { offset: offset(8), opacity: 1 },
        { offset: offset(8.1), opacity: 0 },
      ] : []),
      { offset: 1, opacity: resetAfterAccounts ? 0 : 1 },
    ],
  };
}

function skeleton(selector: string, start: number, end: number): WorkflowTrack {
  return {
    selector,
    keyframes: [
      { offset: 0, opacity: 0, transform: "scaleX(0.3)" },
      { offset: offset(start), opacity: 0, transform: "scaleX(0.3)", easing: ease },
      { offset: offset(start + 0.8), opacity: 1, transform: "scaleX(1)" },
      { offset: offset(end), opacity: 1 },
      { offset: offset(end + 0.3), opacity: 0 },
      { offset: 1, opacity: 0 },
    ],
  };
}

// Every reveal shares one loop clock. Reset account contents while hidden so the
// final crossfade returns to an empty table, ready for the next account reveal.
const tracks: readonly WorkflowTrack[] = [
  {
    selector: "[data-scene='accounts'], [data-step-title='accounts']",
    keyframes: [
      { offset: 0, opacity: 1 },
      { offset: offset(7.6), opacity: 1 },
      { offset: offset(8), opacity: 0 },
      { offset: resetStart, opacity: 0, easing: ease },
      { offset: 1, opacity: 1 },
    ],
  },
  {
    selector: "[data-scene='transactions'], [data-step-title='transactions']",
    keyframes: [
      { offset: 0, opacity: 0 },
      { offset: offset(8), opacity: 0 },
      { offset: offset(8.444), opacity: 1 },
      { offset: offset(15.6), opacity: 1 },
      { offset: offset(16), opacity: 0 },
      { offset: 1, opacity: 0 },
    ],
  },
  {
    selector: "[data-scene='reports'], [data-step-title='reports']",
    keyframes: [
      { offset: 0, opacity: 0 },
      { offset: offset(16), opacity: 0 },
      { offset: offset(16.444), opacity: 1 },
      { offset: resetStart, opacity: 1, easing: ease },
      { offset: 1, opacity: 0 },
    ],
  },
  ...accounts.flatMap((_, index) => {
    const stagger = index * 0.444;
    return [
      reveal(`[data-account-mark='${index}']`, 0.55 + stagger, 0.889, 0.68, true),
      reveal(`[data-account-name='${index}']`, 0.7 + stagger, 0.444, undefined, true),
      skeleton(`[data-account-loading='${index}']`, 1.1 + stagger, 3.05 + stagger),
      reveal(`[data-account-synced='${index}']`, 3.1 + stagger, 0.6, 0.84, true),
      reveal(`[data-account-connected='${index}']`, 3.2 + stagger, 0.444, undefined, true),
      reveal(`[data-transaction-name='${index}']`, 8.5 + stagger),
      skeleton(`[data-transaction-loading='${index}']`, 8.65 + stagger, 10.75 + stagger),
      reveal(`[data-transaction-pill='${index}']`, 10.8 + stagger, 0.6, 0.84),
      reveal(`[data-transaction-amount='${index}']`, 10.9 + stagger),
    ];
  }),
  reveal("[data-success-disc]", 16.4, 0.889, 0.8),
  {
    selector: "[data-success-check]",
    keyframes: [
      { offset: 0, strokeDashoffset: "1" },
      { offset: offset(16.9), strokeDashoffset: "1", easing: ease },
      { offset: offset(17.65), strokeDashoffset: "0" },
      { offset: 1, strokeDashoffset: "0" },
    ],
  },
  reveal("[data-report-heading]", 16.8, 0.6),
  reveal("[data-download]", 17.6, 0.7, 0.96),
  ...[0, 1, 2].map((index) => ({
    selector: `[data-step-progress='${index}']`,
    keyframes: [
      { offset: 0, transform: "scaleX(0)" },
      ...(index ? [{ offset: offset(index * 8), transform: "scaleX(0)" }] : []),
      { offset: offset(index * 8 + 7.55), transform: "scaleX(1)" },
      { offset: resetStart, transform: "scaleX(1)", easing: ease },
      { offset: 1, transform: "scaleX(0)" },
    ],
  })),
];

function DownloadGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function FilingWorkflowAnimation() {
  const rootRef = useRef<HTMLDivElement>(null);
  const id = useId();
  useWorkflowPlayback(rootRef, tracks, duration, duration * offset(22));

  return (
    <figure className={styles.figure} aria-label="Illustrative Glide workflow: add accounts, sync transactions, and download reports" aria-describedby={`${id}-caption`}>
      <div ref={rootRef} className={styles.player} data-testid="filing-workflow">
        <div id={`${id}-visual`} aria-hidden="true">
          <div className={styles.stage} data-testid="filing-workflow-stage">
            <div className={styles.heading}>
              <div className={styles.titles}>
                <p data-step-title="accounts" className={styles.firstTitle}><span>Step 1</span><strong>Add accounts</strong></p>
                <p data-step-title="transactions"><span>Step 2</span><strong>Sync transactions</strong></p>
                <p data-step-title="reports"><span>Step 3</span><strong>Done! Download reports</strong></p>
              </div>
              <div className={styles.progress}>
                {[0, 1, 2].map((step) => <span key={step}><i data-step-progress={step} /></span>)}
              </div>
            </div>
            <div className={styles.paper} data-testid="filing-workflow-paper">
              <div className={`${styles.scene} ${styles.accounts}`} data-scene="accounts">
                {accounts.map(({ name, type, Mark }, index) => (
                  <div className={styles.row} key={name}>
                    <div className={styles.accountCell}>
                      <span className={styles.mark} data-account-mark={index}><Mark size={40} /></span>
                      <div className={styles.accountText} data-account-name={index}><strong>{name}</strong><small>{type}</small></div>
                    </div>
                    <div className={styles.statusCell}>
                      <span className={styles.skeleton} data-account-loading={index} />
                      <span className={`${styles.pill} ${styles.green}`} data-account-synced={index}><CheckIcon />Synced</span>
                    </div>
                    <div className={styles.valueCell}><span className={styles.connected} data-account-connected={index}>Connected</span></div>
                  </div>
                ))}
              </div>

              <div className={`${styles.scene} ${styles.transactions}`} data-scene="transactions">
                {accounts.map(({ name, Mark, activity, action, tone, amount }, index) => (
                  <div className={styles.row} key={name}>
                    <div className={styles.accountCell}>
                      <span className={styles.mark}><Mark size={40} /></span>
                      <div className={styles.accountText}><strong>{name}</strong><small data-transaction-name={index}>{activity}</small></div>
                    </div>
                    <div className={styles.statusCell}>
                      <span className={styles.skeleton} data-transaction-loading={index} />
                      <span className={`${styles.pill} ${styles[tone]}`} data-transaction-pill={index}>{action}</span>
                    </div>
                    <div className={styles.valueCell}><span data-transaction-amount={index}>{amount}</span></div>
                  </div>
                ))}
              </div>

              <div className={`${styles.scene} ${styles.reports}`} data-scene="reports">
                <div className={styles.successDisc} data-success-disc>
                  <svg viewBox="0 0 52 52" fill="none"><path data-success-check d="m15 26 8 8 15-17" pathLength="1" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <div className={styles.reportHeading} data-report-heading>
                  <strong>Your reports are ready.</strong>
                </div>
                <div className={styles.download} data-download><DownloadGlyph />Download reports</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <figcaption id={`${id}-caption`} className="sr-only">
        Add accounts, sync transactions, and download your tax reports. Sample data shown.
      </figcaption>
    </figure>
  );
}
