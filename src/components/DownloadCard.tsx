import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Check, CloudDownload } from "lucide-react";
import { formatMegabytes, formatTimeLeft, type DownloadProgress } from "../lib/runtimeAssets";

const GROUP_LABELS: Record<string, string> = {
  engine: "TeX engine",
  zh: "Chinese fonts",
  ja: "Japanese fonts"
};

/** How far back the download rate is averaged. */
const RATE_WINDOW_MS = 8000;

function useDownloadRate(download: DownloadProgress): number | null {
  const samples = useRef<{ time: number; loaded: number }[]>([]);
  const [rate, setRate] = useState<number | null>(null);
  useEffect(() => {
    const now = performance.now();
    samples.current = [...samples.current.filter((sample) => now - sample.time < RATE_WINDOW_MS), { time: now, loaded: download.loaded }];
    const first = samples.current[0];
    const seconds = (now - first.time) / 1000;
    setRate(seconds >= 2 ? (download.loaded - first.loaded) / seconds : null);
  }, [download]);
  return rate;
}

/** The preview's placeholder while the engine or fonts download: overall progress, speed, and each part. */
export function DownloadCard({ download }: { download: DownloadProgress }) {
  const rate = useDownloadRate(download);
  const fraction = download.total > 0 ? Math.min(1, download.loaded / download.total) : 0;
  const onlyFonts = download.groups.every((group) => group.group !== "engine");
  const title = onlyFonts
    ? `Downloading ${download.groups.map((group) => GROUP_LABELS[group.group] ?? group.group).join(" and ").toLowerCase()}`
    : "Downloading the TeX engine";
  const timeLeft = formatTimeLeft(download.total - download.loaded, rate);
  const active = download.groups.find((group) => group.loaded < group.total)?.group;

  return (
    <div className="download-card" role="status">
      <div className="download-card-head">
        <CloudDownload size={18} strokeWidth={1.75} aria-hidden="true" />
        <div>
          <strong>{title}</strong>
          <span>One-time download, kept for offline use</span>
        </div>
        <span className="download-card-percent">{Math.floor(fraction * 100)}%</span>
      </div>

      <div
        className="download-meter"
        role="progressbar"
        aria-label={title}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.floor(fraction * 100)}
        style={{ "--progress": `${fraction * 100}%` } as CSSProperties}
      />
      <div className="download-card-stats">
        <span>
          {formatMegabytes(download.loaded)} of {formatMegabytes(download.total)}
        </span>
        <span>{rate ? [`${formatMegabytes(rate)}/s`, timeLeft].filter(Boolean).join(" · ") : "Measuring speed…"}</span>
      </div>

      {download.groups.length > 1 && (
        <ul className="download-card-groups">
          {download.groups.map((group) => {
            const done = group.loaded >= group.total;
            const state = done ? "done" : group.group === active ? "active" : "waiting";
            return (
              <li key={group.group} className={`download-group download-group--${state}`}>
                <span className="download-group-mark" aria-hidden="true">
                  {done && <Check size={10} strokeWidth={3} />}
                </span>
                <span className="download-group-label">{GROUP_LABELS[group.group] ?? group.group}</span>
                <span className="download-group-size">
                  {done ? formatMegabytes(group.total) : `${formatMegabytes(group.loaded)} / ${formatMegabytes(group.total)}`}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <p className="download-card-note">Everything runs in your browser. After this, compiles take a few seconds.</p>
    </div>
  );
}
