"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Prize = {
  id: string;
  name: string;
  color: string;
  imageUrl: string | null;
  remaining: number;
};

type CampaignData = {
  campaign: {
    id: string;
    name: string;
    description: string;
    startsAt: string;
    endsAt: string;
    status: string;
    remaining: number;
  };
  prizes: Prize[];
  participant: {
    id: string;
    participant_name: string | null;
    code_hint: string;
    spins_limit: number;
    spins_used: number;
    status: string;
  } | null;
  history: Array<{
    id: string;
    prize_id: string;
    prize_name: string;
    fulfillment_status: string;
    created_at: string;
  }>;
};

const stateCopy: Record<string, { title: string; text: string }> = {
  scheduled: {
    title: "Sắp bắt đầu",
    text: "Vòng quay đang được chuẩn bị. Hãy quay lại đúng giờ nhé.",
  },
  paused: {
    title: "Đang tạm dừng",
    text: "Admin đang cập nhật vòng quay. Lượt của bạn vẫn được giữ nguyên.",
  },
  ended: {
    title: "Đã kết thúc",
    text: "Cảm ơn bạn đã tham gia chương trình.",
  },
  sold_out: {
    title: "Quà đã được trao hết",
    text: "Rất tiếc, chương trình đã hết phần thưởng. Lượt của bạn không bị trừ.",
  },
  draft: {
    title: "Chưa mở",
    text: "Vòng quay này chưa sẵn sàng để tham gia.",
  },
};

export function WheelExperience({ slug }: { slug: string }) {
  const [data, setData] = useState<CampaignData | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [notice, setNotice] = useState("");
  const [winner, setWinner] = useState<{ name: string; color: string } | null>(
    null,
  );
  const [now, setNow] = useState(0);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/public/campaigns/${slug}`, {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setData(payload);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không thể tải vòng quay.");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [load]);

  const gradient = useMemo(() => {
    if (!data?.prizes.length) return "#f0ebe1";
    const size = 100 / data.prizes.length;
    return `conic-gradient(${data.prizes
      .map(
        (prize, index) =>
          `${prize.color} ${index * size}% ${(index + 1) * size}%`,
      )
      .join(",")})`;
  }, [data]);

  async function claim(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setNotice("");
    try {
      const response = await fetch(`/api/public/campaigns/${slug}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setCode("");
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Mã không hợp lệ.");
    } finally {
      setSubmitting(false);
    }
  }

  async function spin() {
    if (!data || spinning) return;
    setSpinning(true);
    setWinner(null);
    setNotice("");
    try {
      const requestId = crypto.randomUUID();
      const response = await fetch(`/api/public/campaigns/${slug}/spin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      const prizeId = payload.result.prizeId ?? payload.result.prize_id;
      const index = data.prizes.findIndex((prize) => prize.id === prizeId);
      const segment = 360 / Math.max(1, data.prizes.length);
      const target = 360 - (index * segment + segment / 2);
      const nextRotation = rotation + 360 * 6 + target - (rotation % 360);
      setRotation(nextRotation);
      const prize = data.prizes[index];
      window.setTimeout(() => {
        setWinner({
          name: payload.result.prizeName ?? payload.result.prize_name,
          color: prize?.color ?? "#ff5a36",
        });
        setSpinning(false);
        load();
      }, 4300);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Chưa thể quay.");
      setSpinning(false);
      load();
    }
  }

  if (loading) {
    return (
      <main className="wheel-page wheel-loading" role="status">
        <div className="loading-dot" />
        <p>Đang chuẩn bị vòng quay…</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="wheel-page wheel-empty">
        <h1>Không tìm thấy vòng quay</h1>
        <p>{notice || "Đường dẫn có thể không đúng hoặc đã ngừng hoạt động."}</p>
        <Link className="button button-primary" href="/">Về trang chủ</Link>
      </main>
    );
  }

  const remainingSpins = data.participant
    ? Math.max(0, data.participant.spins_limit - data.participant.spins_used)
    : 0;
  const state = stateCopy[data.campaign.status];
  const secondsToStart = Math.max(
    0,
    Math.floor((new Date(data.campaign.startsAt).getTime() - now) / 1000),
  );
  const countdown =
    secondsToStart > 0
      ? `${Math.floor(secondsToStart / 86400)} ngày ${Math.floor(
          (secondsToStart % 86400) / 3600,
        )} giờ ${Math.floor((secondsToStart % 3600) / 60)} phút`
      : "";

  return (
    <main className="wheel-page">
      <nav className="wheel-nav">
        <Link className="brand brand-light" href="/">
          <span className="brand-mark">Q</span>
          <span>Quay Vui</span>
        </Link>
        <span className="secure-note"><i /> Kết quả được bảo vệ</span>
      </nav>

      <section className="wheel-stage">
        <div className="wheel-copy">
          <p className="eyebrow eyebrow-light"><span /> Vòng quay đang diễn ra</p>
          <h1>{data.campaign.name}</h1>
          <p>{data.campaign.description}</p>
          {data.participant ? (
            <div className="participant-chip">
              <span>Xin chào</span>
              <strong>{data.participant.participant_name || "Người tham gia"}</strong>
              <small>{data.participant.code_hint}</small>
            </div>
          ) : null}
        </div>

        <div className="wheel-visual">
          <div className="wheel-pointer" />
          <div
            className={`wheel-disc ${spinning ? "is-spinning" : ""}`}
            style={{
              background: gradient,
              transform: `rotate(${rotation}deg)`,
            }}
          >
            {data.prizes.map((prize, index) => {
              const angle = index * (360 / data.prizes.length) +
                180 / data.prizes.length;
              const flipLabel = angle > 90 && angle < 270;
              return (
                <div
                  className="wheel-label-anchor"
                  key={prize.id}
                  style={{
                    transform: `rotate(${angle}deg)`,
                  }}
                >
                  <span
                    className="wheel-label"
                    style={{
                      transform: `translateX(-50%) rotate(${flipLabel ? 180 : 0}deg)`,
                    }}
                  >
                    {prize.name}
                  </span>
                </div>
              );
            })}
            <div className="wheel-hub">QUAY</div>
          </div>
          <div className="wheel-shadow" />
        </div>

        <div className="wheel-panel">
          {state ? (
            <div className="state-card">
              <span className="state-icon">◷</span>
              <h2>{state.title}</h2>
              <p>{state.text}</p>
              {countdown ? <strong>{countdown}</strong> : null}
            </div>
          ) : !data.participant ? (
            <form className="code-form" onSubmit={claim}>
              <span className="step-label">BƯỚC 1 / 2</span>
              <h2>Nhập mã của bạn</h2>
              <p>Mỗi mã chỉ sử dụng được trong vòng quay này.</p>
              <label htmlFor="access-code">Mã tham gia</label>
              <input
                id="access-code"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="VD: MAYMAN2026"
                autoComplete="one-time-code"
                required
              />
              <button className="button button-primary button-block" disabled={submitting}>
                {submitting ? "Đang kiểm tra…" : "Xác nhận mã"} <span>→</span>
              </button>
              <small>Không chia sẻ mã của bạn cho người khác.</small>
            </form>
          ) : (
            <div className="spin-controls">
              <span className="step-label">BƯỚC 2 / 2</span>
              <h2>Sẵn sàng thử vận may?</h2>
              <div className="spin-balance">
                <span>Lượt còn lại</span>
                <strong>{remainingSpins}</strong>
              </div>
              <button
                className="button button-primary button-block spin-button"
                onClick={spin}
                disabled={spinning || remainingSpins <= 0}
              >
                {spinning
                  ? "Vòng quay đang chạy…"
                  : remainingSpins > 0
                    ? "Quay ngay"
                    : "Đã hết lượt"}
              </button>
              <p className="fair-note">Một lần bấm chỉ ghi nhận một kết quả.</p>
            </div>
          )}
          {notice ? <p className="form-notice" role="alert">{notice}</p> : null}
        </div>
      </section>

      {data.participant && data.history.length ? (
        <section className="history-section">
          <div>
            <p className="eyebrow"><span /> Riêng tư và rõ ràng</p>
            <h2>Kết quả của bạn</h2>
          </div>
          <div className="history-list">
            {data.history.map((item) => (
              <article key={item.id}>
                <span className="history-gift">✦</span>
                <div>
                  <small>{new Date(item.created_at).toLocaleString("vi-VN")}</small>
                  <strong>{item.prize_name}</strong>
                </div>
                <span className={`fulfillment ${item.fulfillment_status}`}>
                  {item.fulfillment_status === "fulfilled" ? "Đã trao" : "Chờ trao"}
                </span>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {winner ? (
        <div className="winner-overlay" role="dialog" aria-modal="true">
          <div className="winner-card">
            <button aria-label="Đóng" onClick={() => setWinner(null)}>×</button>
            <span className="winner-stars">✦ ✦ ✦</span>
            <p>CHÚC MỪNG BẠN!</p>
            <h2>{winner.name}</h2>
            <div className="winner-swatch" style={{ background: winner.color }} />
            <small>Kết quả đã được lưu. Admin sẽ liên hệ để trao quà.</small>
            <button className="button button-primary" onClick={() => setWinner(null)}>
              Xem lịch sử
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
