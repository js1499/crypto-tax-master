"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { domAnimation, LazyMotion, m, useReducedMotion } from "motion/react";
import {
  CoinbaseMark,
  EthereumMark,
  HyperliquidMark,
  KrakenMark,
  SolanaMark,
} from "@/components/PlatformMarks";
import { CheckIcon, PauseIcon, PlayIcon } from "@/components/icons";

const workflowStages = ["sync", "calculate", "total"] as const;
type WorkflowStage = (typeof workflowStages)[number];

const initialPlaybackDelay = 1_000;
const stageHoldDuration = 1_000;
const stageMotionDurations: Record<WorkflowStage, number> = {
  sync: 5_600,
  calculate: 4_400,
  total: 3_200,
};
const stageDurations = Object.fromEntries(
  workflowStages.map((stage) => [stage, stageMotionDurations[stage] + stageHoldDuration]),
) as Record<WorkflowStage, number>;

const accounts = [
  { name: "Coinbase", type: "Exchange", profitLoss: "+$3,842.16", positive: true, Mark: CoinbaseMark },
  { name: "Hyperliquid", type: "Exchange", profitLoss: "+$5,218.42", positive: true, Mark: HyperliquidMark },
  { name: "Kraken", type: "Exchange", profitLoss: "−$1,106.73", positive: false, Mark: KrakenMark },
  { name: "Solana", type: "Wallet", profitLoss: "+$2,438.09", positive: true, Mark: SolanaMark },
  { name: "Ethereum", type: "Wallet", profitLoss: "+$1,932.74", positive: true, Mark: EthereumMark },
] as const;

const subscribeToHydration = () => () => undefined;
const getHydratedSnapshot = () => true;
const getServerHydratedSnapshot = () => false;

function nextStage(stage: WorkflowStage): WorkflowStage {
  const index = workflowStages.indexOf(stage);
  return workflowStages[(index + 1) % workflowStages.length];
}

function WorkflowStepper({ stage }: { stage: WorkflowStage }) {
  const activeIndex = workflowStages.indexOf(stage);
  const labels = {
    sync: "Sync accounts",
    calculate: "Calculate P/L",
    total: "Portfolio total",
  } as const;

  return (
    <div className="grid h-[50px] grid-cols-3 items-center border-b border-[#e6ebf2] bg-white px-2 sm:h-[62px] sm:px-7">
      {workflowStages.map((item, index) => {
        const isActive = index === activeIndex;
        const isComplete = index < activeIndex;

        return (
          <div key={item} className="relative flex items-center justify-center gap-1.5 sm:gap-2.5">
            {index > 0 ? (
              <span
                className={`absolute top-1/2 right-[70%] h-px w-[58%] -translate-y-1/2 sm:right-[68%] sm:w-[64%] ${
                  isActive || isComplete ? "bg-[#4c7df0]" : "bg-[#dbe3ee]"
                }`}
              />
            ) : null}
            <span
              className={`relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full text-[13px] leading-none font-black sm:size-7 sm:text-[14px] ${
                isActive
                  ? "bg-[#316df4] text-white shadow-[0_6px_16px_rgba(49,109,244,0.28)]"
                  : isComplete
                    ? "bg-[#e4f7ef] text-[#117753]"
                    : "border border-[#d8e1ec] bg-white text-[#67788e]"
              }`}
            >
              {isComplete ? <CheckIcon aria-hidden="true" className="size-3" /> : index + 1}
            </span>
            <span className={`relative z-10 block w-[60px] text-center text-[13px] leading-3 font-extrabold sm:w-auto sm:text-left sm:text-[14px] sm:leading-none ${isActive ? "text-[#153d7a]" : "text-[#66758a]"}`}>
              {labels[item]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SyncStatus({ synced }: { synced: boolean }) {
  return (
    <m.span
      key={synced ? "synced" : "syncing"}
      initial={{ scale: 0.94 }}
      animate={{ scale: 1 }}
      transition={{ duration: 0.24 }}
      className={`inline-flex min-w-[58px] items-center justify-center gap-1 rounded-full px-2 py-1 text-[10px] leading-none font-black sm:min-w-[72px] sm:text-[11px] ${
        synced ? "bg-[#e6f7f0] text-[#117451]" : "bg-[#edf2f8] text-[#40546e]"
      }`}
      {...(synced ? { "data-account-synced": "true" } : {})}
    >
      {synced ? <CheckIcon aria-hidden="true" className="size-2.5" /> : <span className="size-1.5 rounded-full bg-[#315fc6]" />}
      {synced ? "Synced" : "Syncing"}
    </m.span>
  );
}

function ProfitLossValue({
  account,
  index,
  stage,
  calculated,
}: {
  account: (typeof accounts)[number];
  index: number;
  stage: WorkflowStage;
  calculated: boolean;
}) {
  if (stage === "sync") {
    return <span className="text-[13px] leading-none font-bold text-[#566980] sm:text-[15px]">After sync</span>;
  }

  if (!calculated) {
    return (
      <span className="relative h-2 w-12 overflow-hidden rounded-full bg-[#e6ebf2] sm:w-16">
        <m.span
          className="block h-full rounded-full bg-[#789cf3]"
          initial={{ width: "18%" }}
          animate={{ width: "100%" }}
          transition={{ duration: 0.9, ease: "easeInOut" }}
        />
      </span>
    );
  }

  return (
    <div className="relative flex min-h-6 items-center justify-end">
      <m.span
        data-account-profit-loss={account.name}
        initial={{ y: 4, scale: 0.96 }}
        animate={{ y: 0, scale: 1 }}
        transition={{ duration: 0.3, delay: index * 0.02 }}
        className={`text-[13px] leading-none font-black tabular-nums sm:text-[15px] ${account.positive ? "text-[#14805a]" : "text-[#c2424c]"}`}
      >
        {account.profitLoss}
      </m.span>
    </div>
  );
}

function AccountTable({
  stage,
  playbackStarted,
  staticMode,
  syncedCount,
  calculatedCount,
}: {
  stage: WorkflowStage;
  playbackStarted: boolean;
  staticMode: boolean;
  syncedCount: number;
  calculatedCount: number;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#e0e6ee] bg-white shadow-[0_10px_28px_rgba(32,60,98,0.05)] sm:rounded-2xl">
      <div className="grid grid-cols-[1fr_70px_82px] items-center border-b border-[#e8edf3] bg-[#f7f9fc] px-2.5 py-1 text-[10px] leading-none font-black tracking-[0.06em] text-[#647389] uppercase sm:grid-cols-[1fr_92px_116px] sm:px-4 sm:py-1.5 sm:text-[11px]">
        <span>Account</span>
        <span className="text-center">Status</span>
        <span className="text-right">Profit / loss</span>
      </div>
      {accounts.map((account, index) => {
        const syncEntrance = stage === "sync" && !staticMode;
        return (
          <m.div
            key={`${stage}-${account.name}`}
            data-account={account.name}
            initial={syncEntrance ? { opacity: 0 } : false}
            animate={playbackStarted || !syncEntrance ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 0.4, delay: syncEntrance && playbackStarted ? 0.15 + index * 0.24 : 0 }}
            className="grid min-h-9 grid-cols-[1fr_70px_82px] items-center border-b border-[#edf1f5] px-2.5 last:border-0 sm:min-h-11 sm:grid-cols-[1fr_92px_116px] sm:px-4"
          >
            <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
              <span className="shrink-0 [&_svg]:size-[21px] sm:[&_svg]:size-[26px]">
                <account.Mark size={26} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[13px] leading-[14px] font-extrabold text-[#183658] sm:text-[15px] sm:leading-4">{account.name}</p>
                <p className="hidden text-[10px] leading-[11px] font-semibold text-[#596b82] sm:block sm:text-[11px] sm:leading-3">{account.type}</p>
              </div>
            </div>
            <div className="flex justify-center">
              <SyncStatus synced={staticMode || stage !== "sync" || index < syncedCount} />
            </div>
            <ProfitLossValue
              account={account}
              index={index}
              stage={stage}
              calculated={staticMode || stage === "total" || index < calculatedCount}
            />
          </m.div>
        );
      })}
    </div>
  );
}

function StageSummary({ stage, staticMode, syncedCount }: { stage: WorkflowStage; staticMode: boolean; syncedCount: number }) {
  if (stage === "sync" && !staticMode) {
    return (
      <div className="flex min-h-[52px] items-center justify-between gap-3 rounded-xl border border-[#d8e5fb] bg-[#f1f6ff] px-3 sm:min-h-[66px] sm:rounded-2xl sm:px-5">
        <div>
          <p className="text-[13px] leading-none font-black text-[#214f9a] sm:text-[15px]">Adding your accounts</p>
          <p className="mt-1 text-[10px] leading-none font-semibold text-[#536986] sm:text-[11px]">Balances and activity are syncing</p>
        </div>
        <span className="text-[13px] leading-none font-black tabular-nums text-[#315fbf] sm:text-[15px]">{syncedCount} / 5 synced</span>
      </div>
    );
  }

  if (stage === "calculate" && !staticMode) {
    return (
      <div className="flex min-h-[52px] items-center gap-3 rounded-xl border border-[#d8e5fb] bg-[#f1f6ff] px-3 sm:min-h-[66px] sm:rounded-2xl sm:px-5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#316df4] text-[14px] leading-none font-black text-white sm:size-8">2</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] leading-none font-black text-[#214f9a] sm:text-[15px]">Calculating P/L for every account</p>
            <span className="hidden text-[10px] leading-none font-extrabold text-[#5b72a1] min-[360px]:block sm:text-[11px]">In progress</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#dbe5f7]">
            <m.span
              className="block h-full rounded-full bg-gradient-to-r from-[#316df4] to-[#24b98b]"
              initial={{ width: "8%" }}
              animate={{ width: "100%" }}
              transition={{ duration: 3.7, delay: 0.35, ease: "easeInOut" }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <m.div
      data-testid="portfolio-total"
      initial={staticMode ? false : { y: 8, scale: 0.99 }}
      animate={{ y: 0, scale: 1 }}
      transition={{ duration: 0.5, delay: staticMode ? 0 : 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="flex min-h-[58px] items-center justify-between gap-3 rounded-xl border border-[#b8d3ff] bg-gradient-to-r from-[#eaf2ff] to-[#eefbf7] px-3 shadow-[0_12px_30px_rgba(45,104,222,0.1)] sm:min-h-[78px] sm:rounded-2xl sm:px-5"
    >
      <div>
        <p className="text-[11px] leading-none font-extrabold text-[#45617f] sm:text-[14px]">Total profit across 5 accounts</p>
        <p className="mt-1 text-[10px] leading-none font-semibold text-[#708197] sm:text-[11px]">Illustrative sample portfolio</p>
      </div>
      <div className="text-right">
        <p className="text-[25px] leading-none font-black tracking-[-0.04em] text-[#127753] sm:text-4xl">+$12,324.68</p>
        <span className="mt-1 inline-flex items-center gap-1 text-[10px] leading-none font-black text-[#257057] sm:text-[11px]">
          <CheckIcon aria-hidden="true" className="size-2.5" /> Calculated
        </span>
      </div>
    </m.div>
  );
}

function CalculationWorkspace({
  stage,
  playbackStarted,
  staticMode = false,
  syncedCount = accounts.length,
  calculatedCount = accounts.length,
}: {
  stage: WorkflowStage;
  playbackStarted: boolean;
  staticMode?: boolean;
  syncedCount?: number;
  calculatedCount?: number;
}) {
  const copy = {
    sync: ["All your accounts in one place", "See your full portfolio together."],
    calculate: ["Clear P/L for every account", "Review each result at a glance."],
    total: ["One accurate portfolio total", "Ready for your tax reports."],
  } as const;

  return (
    <div data-testid={`workflow-stage-${stage}`} className="h-full overflow-hidden bg-[#fbfcfe] px-2.5 py-1.5 sm:px-5 sm:py-3">
      <div className="mb-1 flex items-start justify-between gap-2 sm:mb-2">
        <div>
          <h2 className="text-xl leading-[22px] font-black tracking-[-0.025em] text-[#13345d] sm:text-[28px] sm:leading-[30px]">{copy[stage][0]}</h2>
          <p className="mt-1 hidden text-sm leading-[18px] font-medium text-[#617188] sm:block">{copy[stage][1]}</p>
        </div>
        <span className="hidden shrink-0 rounded-md bg-[#edf3ff] px-2 py-1 text-[10px] leading-none font-black text-[#3366cf] min-[360px]:inline-flex sm:text-[11px]">Illustrative</span>
      </div>

      <AccountTable
        stage={stage}
        playbackStarted={playbackStarted}
        staticMode={staticMode}
        syncedCount={syncedCount}
        calculatedCount={calculatedCount}
      />
      <div className="mt-1.5 sm:mt-2.5">
        <StageSummary stage={stage} staticMode={staticMode} syncedCount={syncedCount} />
      </div>
    </div>
  );
}

export function AnimatedHeroWorkflow() {
  const reducedMotionPreference = useReducedMotion() ?? false;
  const hasHydrated = useSyncExternalStore(
    subscribeToHydration,
    getHydratedSnapshot,
    getServerHydratedSnapshot,
  );
  const prefersReducedMotion = hasHydrated && reducedMotionPreference;
  const rootRef = useRef<HTMLDivElement>(null);
  const remainingTime = useRef(stageDurations.sync);
  const [stage, setStage] = useState<WorkflowStage>("sync");
  const [playbackStarted, setPlaybackStarted] = useState(false);
  const [manualPaused, setManualPaused] = useState(false);
  const [isInView, setIsInView] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const [syncedCount, setSyncedCount] = useState(0);
  const [calculatedCount, setCalculatedCount] = useState(0);
  const displayedStage: WorkflowStage = prefersReducedMotion ? "total" : stage;
  const isRunning = playbackStarted && !prefersReducedMotion && !manualPaused && isInView && pageVisible;

  useEffect(() => {
    let timer: number | undefined;
    const schedulePlayback = () => {
      timer = window.setTimeout(() => setPlaybackStarted(true), initialPlaybackDelay);
    };

    if (document.readyState === "complete") {
      schedulePlayback();
    } else {
      window.addEventListener("load", schedulePlayback, { once: true });
    }

    return () => {
      window.removeEventListener("load", schedulePlayback);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsInView(entry.isIntersecting && entry.intersectionRatio >= 0.18),
      { threshold: [0, 0.18, 0.5] },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleVisibility = () => setPageVisible(document.visibilityState === "visible");
    handleVisibility();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  useEffect(() => {
    if (!isRunning) return;

    let completed = false;
    const startedAt = performance.now();
    const timer = window.setTimeout(() => {
      completed = true;
      const upcomingStage = nextStage(stage);
      remainingTime.current = stageDurations[upcomingStage];
      if (upcomingStage === "sync") {
        setSyncedCount(0);
        setCalculatedCount(0);
      } else if (upcomingStage === "calculate") {
        setCalculatedCount(0);
      } else {
        setCalculatedCount(accounts.length);
      }
      setStage(upcomingStage);
    }, remainingTime.current);

    return () => {
      window.clearTimeout(timer);
      if (!completed) {
        remainingTime.current = Math.max(120, remainingTime.current - (performance.now() - startedAt));
      }
    };
  }, [isRunning, stage]);

  useEffect(() => {
    if (!isRunning || stage !== "sync" || syncedCount >= accounts.length) return;
    const timer = window.setTimeout(() => setSyncedCount((count) => count + 1), 720);
    return () => window.clearTimeout(timer);
  }, [isRunning, stage, syncedCount]);

  useEffect(() => {
    if (!isRunning || stage !== "calculate" || calculatedCount >= accounts.length) return;
    const timer = window.setTimeout(() => setCalculatedCount((count) => count + 1), 620);
    return () => window.clearTimeout(timer);
  }, [calculatedCount, isRunning, stage]);

  return (
    <LazyMotion features={domAnimation} strict>
      <div
        ref={rootRef}
        data-workflow-stage={displayedStage}
        data-workflow-running={isRunning ? "true" : "false"}
        data-playback-started={playbackStarted ? "true" : "false"}
        data-start-delay-ms={initialPlaybackDelay}
        data-stage-hold-ms={stageHoldDuration}
        className="relative h-full w-full"
      >
        <div aria-hidden="true" className="absolute inset-x-0 top-0 flex justify-center">
          <span className="inline-flex min-h-8 items-center rounded-full border border-white/25 bg-[#17477d]/80 px-3 text-[11px] leading-none font-black tracking-[0.08em] text-[#e7f0ff] uppercase shadow-[0_12px_30px_rgba(0,0,0,0.14)] backdrop-blur-xl sm:text-[13px]">
            Illustrative portfolio calculation
          </span>
        </div>

        <m.div
          id="glide-workflow-demo"
          className="alternative-workflow-window absolute inset-x-0 top-10 bottom-1 overflow-hidden rounded-[20px] border border-white/75 bg-white shadow-[0_34px_80px_-28px_rgba(2,39,101,0.66)] sm:top-12 sm:bottom-2 sm:rounded-[26px]"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 18, scale: 0.975 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.65, ease: [0.16, 1, 0.3, 1] }}
        >
          <div aria-hidden="true" className="h-full">
            <div className="flex h-11 items-center justify-between border-b border-[#e2e8f0] bg-[#fbfcfe] px-3 sm:h-12 sm:px-4">
              <div className="flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-lg bg-gradient-to-br from-[#2b8df4] to-[#25bb8b] text-[15px] leading-none font-black italic text-white">G</span>
                <span className="text-[15px] leading-none font-black tracking-[-0.025em] text-[#153d67] sm:text-[17px]">Glide</span>
                <span className="hidden h-4 w-px bg-[#dfe5ed] sm:block" />
                <span className="hidden text-[11px] leading-none font-bold text-[#53647c] sm:block">Portfolio calculation</span>
              </div>
              <span className="mr-10 rounded-md bg-[#eef3fb] px-2 py-1 text-[10px] leading-none font-bold text-[#4f6077] sm:mr-[86px] sm:text-[11px]">Sample data</span>
            </div>

            <WorkflowStepper stage={displayedStage} />
            <div className="h-[calc(100%-94px)] sm:h-[calc(100%-110px)]">
              {prefersReducedMotion ? (
                <CalculationWorkspace stage="total" playbackStarted staticMode />
              ) : (
                <CalculationWorkspace
                  key={stage}
                  stage={stage}
                  playbackStarted={playbackStarted}
                  syncedCount={syncedCount}
                  calculatedCount={calculatedCount}
                />
              )}
            </div>
          </div>

          {!prefersReducedMotion ? (
            <button
              type="button"
              aria-controls="glide-workflow-demo"
              aria-label={manualPaused ? "Play workflow animation" : "Pause workflow animation"}
              aria-pressed={manualPaused}
              onClick={() => setManualPaused((paused) => !paused)}
              className="absolute top-0.5 right-1.5 z-50 inline-flex min-h-10 min-w-10 items-center justify-center gap-1.5 rounded-lg border border-[#d7e0eb] bg-white px-2 text-[11px] leading-none font-extrabold text-[#284768] shadow-sm transition hover:bg-[#f2f6fb] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6df6] sm:right-2 sm:min-h-11 sm:min-w-11 sm:px-3 sm:text-[13px]"
            >
              {manualPaused ? <PlayIcon aria-hidden="true" className="size-3" /> : <PauseIcon aria-hidden="true" className="size-3" />}
              <span className="hidden sm:inline">{manualPaused ? "Play" : "Pause"}</span>
            </button>
          ) : null}
        </m.div>
      </div>
    </LazyMotion>
  );
}
