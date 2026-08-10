"use client";

import Link from "next/link";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

type Prize = {
  id?: string;
  name: string;
  color: string;
  image_url?: string | null;
  quantity: number;
  remaining?: number;
  probability: number;
};

type CampaignSummary = {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: string;
  starts_at: string;
  ends_at: string;
  updated_at?: string;
  prizes: Prize[];
  deviceCount: number;
  spinCount: number;
  pendingCount: number;
};

type CampaignDetail = {
  campaign: CampaignSummary;
  prizes: Prize[];
  devices: Array<{
    id: string;
    code_hint: string;
    spins_limit: number;
    spins_used: number;
    created_at: string;
  }>;
  spins: Array<{
    id: string;
    access_code_id: string;
    prize_name: string;
    code_hint: string;
    fulfillment_status: string;
    fulfillment_note: string | null;
    created_at: string;
  }>;
  audit: Array<{
    id: string;
    action: string;
    details: string;
    created_at: string;
  }>;
};

type DashboardPayload = {
  campaigns: CampaignSummary[];
  totals: {
    campaigns: number;
    active: number;
    spins: number;
    pending: number;
  };
};

const statusLabel: Record<string, string> = {
  draft: "Bản nháp",
  scheduled: "Sắp diễn ra",
  active: "Đang chạy",
  paused: "Tạm dừng",
  ended: "Đã kết thúc",
  sold_out: "Hết quà",
};

const palette = ["#FF5A36", "#FFC857", "#66C3A5", "#4E7CFF", "#A66CFF", "#FF7AA2"];
const defaultCampaignStart = new Date().toISOString();
const defaultCampaignEnd = new Date(
  new Date(defaultCampaignStart).getTime() + 7 * 24 * 60 * 60 * 1000,
).toISOString();

function localInputDate(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadCsv(filename: string, rows: unknown[][]) {
  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function requestJson(path: string, options?: RequestInit) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options?.body ? { "Content-Type": "application/json" } : {}),
      ...options?.headers,
    },
  });
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.error || "Có lỗi xảy ra.");
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return payload;
}

export function AdminDashboard() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [tab, setTab] = useState("overview");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const loadDashboard = useCallback(async () => {
    try {
      const payload = (await requestJson("/api/admin/dashboard", {
        cache: "no-store",
      })) as DashboardPayload;
      setAuthenticated(true);
      setDashboard(payload);
      setSelectedId((current) => current || payload.campaigns[0]?.id || "");
    } catch (error) {
      if ((error as Error & { status?: number }).status === 401) {
        setAuthenticated(false);
      } else {
        setNotice(error instanceof Error ? error.message : "Không thể tải dữ liệu.");
      }
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    if (!id) return;
    try {
      const payload = (await requestJson(`/api/admin/campaigns/${id}`, {
        cache: "no-store",
      })) as CampaignDetail;
      setDetail(payload);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không thể tải vòng quay.");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (authenticated && selectedId) loadDetail(selectedId);
  }, [authenticated, selectedId, loadDetail]);

  async function login(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      await requestJson("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      setPassword("");
      await loadDashboard();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không thể đăng nhập.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await requestJson("/api/admin/logout", { method: "POST" });
    setAuthenticated(false);
    setDashboard(null);
    setDetail(null);
  }

  async function refresh() {
    await Promise.all([loadDashboard(), selectedId ? loadDetail(selectedId) : null]);
  }

  if (authenticated === null) {
    return (
      <main className="admin-loading" role="status">
        <span className="loading-dot" />
        <p>Đang mở khu vực quản trị…</p>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main className="admin-login">
        <section className="login-brand">
          <Link className="brand brand-light" href="/">
            <span className="brand-mark">Q</span>
            <span>Quay Vui</span>
          </Link>
          <div>
            <p className="eyebrow eyebrow-light"><span /> Khu vực riêng tư</p>
            <h1>Điều hành mọi vòng quay từ một nơi.</h1>
            <p>
              Kiểm soát xác suất, kho quà, lượt quay và lịch sử bàn giao
              trong một giao diện rõ ràng.
            </p>
          </div>
          <small>Quay Vui · Hệ thống quản trị chiến dịch</small>
        </section>
        <section className="login-panel">
          <form onSubmit={login}>
            <span className="login-lock">⌁</span>
            <p className="eyebrow"><span /> Xác thực quản trị</p>
            <h2>Chào mừng trở lại</h2>
            <p>Nhập mật khẩu admin được cấp khi website xuất bản.</p>
            <label htmlFor="admin-password">Mật khẩu</label>
            <input
              id="admin-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••••••"
              autoComplete="current-password"
              required
            />
            <button className="button button-primary button-block" disabled={busy}>
              {busy ? "Đang xác thực…" : "Đăng nhập"} <span>→</span>
            </button>
            {notice ? <p className="form-notice" role="alert">{notice}</p> : null}
            <small className="login-demo">
              Bản xem trước dùng mật khẩu: <strong>quaythuong-demo</strong>
            </small>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <Link className="brand brand-light" href="/">
          <span className="brand-mark">Q</span>
          <span>Quay Vui</span>
        </Link>
        <nav aria-label="Quản trị">
          <button className="active"><span>◫</span> Tổng quan</button>
          <button onClick={() => setTab("devices")}><span>⌗</span> Thiết bị</button>
          <button onClick={() => setTab("results")}><span>✦</span> Kết quả</button>
        </nav>
        <div className="sidebar-bottom">
          <a href="mailto:support@example.com"><span>?</span> Trợ giúp</a>
          <button onClick={logout}><span>↗</span> Đăng xuất</button>
        </div>
      </aside>

      <section className="admin-main">
        <header className="admin-header">
          <div>
            <p>TRUNG TÂM ĐIỀU HÀNH</p>
            <h1>Chào buổi sáng, Admin</h1>
          </div>
          <div className="admin-header-actions">
            <span className="live-pill"><i /> Hệ thống ổn định</span>
            <button className="button button-primary" onClick={() => setShowCreate(true)}>
              <span>＋</span> Tạo vòng quay
            </button>
          </div>
        </header>

        {notice ? (
          <div className="admin-notice" role="alert">
            <span>{notice}</span>
            <button onClick={() => setNotice("")}>×</button>
          </div>
        ) : null}

        <section className="metrics-grid">
          <article>
            <span className="metric-icon coral">◫</span>
            <div><small>TỔNG VÒNG QUAY</small><strong>{dashboard?.totals.campaigns ?? 0}</strong></div>
          </article>
          <article>
            <span className="metric-icon green">●</span>
            <div><small>ĐANG HOẠT ĐỘNG</small><strong>{dashboard?.totals.active ?? 0}</strong></div>
          </article>
          <article>
            <span className="metric-icon blue">↻</span>
            <div><small>LƯỢT ĐÃ QUAY</small><strong>{dashboard?.totals.spins ?? 0}</strong></div>
          </article>
          <article>
            <span className="metric-icon yellow">✦</span>
            <div><small>QUÀ CHỜ TRAO</small><strong>{dashboard?.totals.pending ?? 0}</strong></div>
          </article>
        </section>

        <section className="campaign-workspace">
          <div className="campaign-list-panel">
            <div className="panel-heading">
              <div><p className="eyebrow"><span /> Chiến dịch</p><h2>Các vòng quay</h2></div>
              <button onClick={() => setShowCreate(true)}>＋</button>
            </div>
            <div className="campaign-list">
              {dashboard?.campaigns.map((campaign) => (
                <button
                  key={campaign.id}
                  className={selectedId === campaign.id ? "selected" : ""}
                  onClick={() => {
                    setSelectedId(campaign.id);
                    setTab("overview");
                  }}
                >
                  <span className={`campaign-dot ${campaign.status}`} />
                  <div>
                    <strong>{campaign.name}</strong>
                    <small>{campaign.spinCount} lượt · {campaign.deviceCount} thiết bị</small>
                  </div>
                  <span className={`status-badge ${campaign.status}`}>
                    {statusLabel[campaign.status] ?? campaign.status}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {detail ? (
            <CampaignEditor
              key={`${detail.campaign.id}:${detail.campaign.updated_at ?? ""}:${detail.devices.length}:${detail.spins.length}`}
              detail={detail}
              tab={tab}
              setTab={setTab}
              setNotice={setNotice}
              refresh={refresh}
              setBusy={setBusy}
              busy={busy}
            />
          ) : (
            <div className="campaign-empty">
              <span>◫</span>
              <h2>Chọn một vòng quay</h2>
              <p>Xem cấu hình, phần thưởng, mã và kết quả tại đây.</p>
            </div>
          )}
        </section>
      </section>

      {showCreate ? (
        <CreateCampaign
          close={() => setShowCreate(false)}
          created={async (id) => {
            setShowCreate(false);
            await loadDashboard();
            setSelectedId(id);
          }}
          setNotice={setNotice}
        />
      ) : null}
    </main>
  );
}

function CreateCampaign({
  close,
  created,
  setNotice,
}: {
  close: () => void;
  created: (id: string) => Promise<void>;
  setNotice: (value: string) => void;
}) {
  const [form, setForm] = useState({
    name: "",
    description: "",
    startsAt: localInputDate(defaultCampaignStart),
    endsAt: localInputDate(defaultCampaignEnd),
  });
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const payload = await requestJson("/api/admin/campaigns", {
        method: "POST",
        body: JSON.stringify(form),
      });
      await created(payload.id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không thể tạo vòng quay.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <form className="modal-card create-modal" onSubmit={submit}>
        <button className="modal-close" type="button" onClick={close}>×</button>
        <p className="eyebrow"><span /> Chiến dịch mới</p>
        <h2>Tạo một vòng quay</h2>
        <label>Tên vòng quay</label>
        <input
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
          placeholder="VD: Tri ân khách hàng tháng 8"
          required
        />
        <label>Mô tả</label>
        <textarea
          value={form.description}
          onChange={(event) => setForm({ ...form, description: event.target.value })}
          placeholder="Một lời chào ngắn dành cho người tham gia"
        />
        <div className="form-row">
          <div><label>Bắt đầu</label><input type="datetime-local" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} required /></div>
          <div><label>Kết thúc</label><input type="datetime-local" value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} required /></div>
        </div>
        <button className="button button-primary button-block" disabled={busy}>
          {busy ? "Đang tạo…" : "Tạo bản nháp"} <span>→</span>
        </button>
      </form>
    </div>
  );
}

function CampaignEditor({
  detail,
  tab,
  setTab,
  setNotice,
  refresh,
  setBusy,
  busy,
}: {
  detail: CampaignDetail;
  tab: string;
  setTab: (value: string) => void;
  setNotice: (value: string) => void;
  refresh: () => Promise<void>;
  setBusy: (value: boolean) => void;
  busy: boolean;
}) {
  const [campaign, setCampaign] = useState(detail.campaign);
  const [prizes, setPrizes] = useState<Prize[]>(detail.prizes);

  const probabilityTotal = useMemo(
    () => prizes.reduce((sum, prize) => sum + Number(prize.probability || 0), 0),
    [prizes],
  );

  async function save() {
    setBusy(true);
    setNotice("");
    try {
      await requestJson(`/api/admin/campaigns/${campaign.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: campaign.name,
          description: campaign.description,
          startsAt: campaign.starts_at,
          endsAt: campaign.ends_at,
          ...(tab === "prizes"
            ? {
                prizes: prizes.map((prize) => ({
                  ...prize,
                  imageUrl: prize.image_url ?? null,
                })),
              }
            : {}),
        }),
      });
      setNotice("Đã lưu thay đổi.");
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không thể lưu.");
    } finally {
      setBusy(false);
    }
  }

  async function action(value: string) {
    setBusy(true);
    try {
      await requestJson(`/api/admin/campaigns/${campaign.id}/action`, {
        method: "POST",
        body: JSON.stringify({ action: value }),
      });
      setNotice(
        value === "duplicate"
          ? "Đã tạo một bản sao ở trạng thái bản nháp."
          : "Đã cập nhật trạng thái vòng quay.",
      );
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không thể cập nhật.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="campaign-detail-panel">
      <header className="detail-heading">
        <div>
          <div className="detail-title-row">
            <h2>{campaign.name}</h2>
            <span className={`status-badge ${campaign.status}`}>
              {statusLabel[campaign.status] ?? campaign.status}
            </span>
          </div>
          <Link href={`/vong-quay/${campaign.slug}`} target="_blank">
            /vong-quay/{campaign.slug} <span>↗</span>
          </Link>
        </div>
        <div className="detail-actions">
          <button onClick={() => navigator.clipboard.writeText(`${location.origin}/vong-quay/${campaign.slug}`)}>Sao chép link</button>
          {campaign.status === "active" ? (
            <button className="button-warning" onClick={() => action("pause")} disabled={busy}>Tạm dừng</button>
          ) : campaign.status !== "ended" ? (
            <button className="button-success" onClick={() => action("activate")} disabled={busy}>Mở vòng quay</button>
          ) : null}
          <button onClick={() => action("duplicate")} disabled={busy}>Nhân bản</button>
        </div>
      </header>

      <div className="detail-tabs">
        {[
          ["overview", "Cấu hình"],
          ["prizes", `Phần thưởng (${prizes.length})`],
          ["devices", `Thiết bị (${detail.devices.length})`],
          ["results", `Kết quả (${detail.spins.length})`],
          ["audit", "Nhật ký"],
        ].map(([value, label]) => (
          <button key={value} className={tab === value ? "active" : ""} onClick={() => setTab(value)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="editor-section">
          <div className="editor-heading"><div><h3>Thông tin vòng quay</h3><p>Múi giờ mặc định: Asia/Ho_Chi_Minh</p></div></div>
          <div className="form-grid">
            <div className="wide"><label>Tên vòng quay</label><input value={campaign.name} onChange={(event) => setCampaign({ ...campaign, name: event.target.value })} /></div>
            <div className="wide"><label>Mô tả</label><textarea value={campaign.description} onChange={(event) => setCampaign({ ...campaign, description: event.target.value })} /></div>
            <div><label>Bắt đầu</label><input type="datetime-local" value={localInputDate(campaign.starts_at)} onChange={(event) => setCampaign({ ...campaign, starts_at: new Date(event.target.value).toISOString() })} /></div>
            <div><label>Kết thúc</label><input type="datetime-local" value={localInputDate(campaign.ends_at)} onChange={(event) => setCampaign({ ...campaign, ends_at: new Date(event.target.value).toISOString() })} /></div>
          </div>
          <div className="editor-footer">
            {campaign.status !== "ended" ? <button className="danger-link" onClick={() => action("end")}>Kết thúc vòng quay</button> : <span />}
            <button className="button button-primary" onClick={save} disabled={busy}>{busy ? "Đang lưu…" : "Lưu thay đổi"}</button>
          </div>
        </div>
      ) : null}

      {tab === "prizes" ? (
        <div className="editor-section">
          <div className="editor-heading">
            <div><h3>Phần thưởng & xác suất</h3><p>Giải hết hàng sẽ tự được loại khỏi lần quay tiếp theo.</p></div>
            <span className={Math.abs(probabilityTotal - 100) < 0.01 ? "total-ok" : "total-error"}>
              Tổng: {probabilityTotal.toFixed(1)}%
            </span>
          </div>
          <div className="prize-editor-list">
            {prizes.map((prize, index) => (
              <div className="prize-editor-row" key={prize.id ?? index}>
                <input className="color-input" type="color" value={prize.color} onChange={(event) => setPrizes(prizes.map((item, itemIndex) => itemIndex === index ? { ...item, color: event.target.value } : item))} />
                <div className="prize-name"><label>Tên giải</label><input value={prize.name} onChange={(event) => setPrizes(prizes.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} /></div>
                <div><label>Số lượng</label><input type="number" min="0" value={prize.quantity} onChange={(event) => setPrizes(prizes.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: Number(event.target.value) } : item))} /></div>
                <div><label>Còn lại</label><strong>{prize.remaining ?? prize.quantity}</strong></div>
                <div><label>Xác suất</label><span className="probability-input"><input type="number" min="0" max="100" step="0.1" value={prize.probability} onChange={(event) => setPrizes(prizes.map((item, itemIndex) => itemIndex === index ? { ...item, probability: Number(event.target.value) } : item))} /><i>%</i></span></div>
                <button className="row-remove" aria-label="Xóa giải" onClick={() => setPrizes(prizes.filter((_, itemIndex) => itemIndex !== index))}>×</button>
              </div>
            ))}
          </div>
          <button className="add-row-button" onClick={() => setPrizes([...prizes, { name: `Phần thưởng ${prizes.length + 1}`, color: palette[prizes.length % palette.length], quantity: 10, remaining: 10, probability: 0 }])}>＋ Thêm phần thưởng</button>
          <div className="editor-footer"><span>Chỉ chỉnh được khi vòng quay không ở trạng thái đang chạy.</span><button className="button button-primary" onClick={save} disabled={busy || Math.abs(probabilityTotal - 100) > 0.01}>Lưu phần thưởng</button></div>
        </div>
      ) : null}

      {tab === "devices" ? (
        <div className="editor-section">
          <div className="editor-heading">
            <div><h3>Thiết bị</h3><p>Mỗi trình duyệt có một lượt ban đầu trong chiến dịch này.</p></div>
          </div>
          <div className="data-table">
            <div className="table-row table-head"><span>Thiết bị</span><span>Khởi tạo</span><span>Lượt</span><span>Kết quả gần nhất</span><span /></div>
            {detail.devices.map((item) => {
              const latest = detail.spins.find(
                (spin) => spin.access_code_id === item.id,
              );
              return (
                <div className="table-row" key={item.id}>
                  <strong>{item.code_hint}</strong>
                  <span>{new Date(item.created_at).toLocaleString("vi-VN")}</span>
                  <span>{Math.max(0, item.spins_limit - item.spins_used)} còn lại</span>
                  <span>{latest?.prize_name ?? "Chưa quay"}</span>
                  <button
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      setNotice("");
                      try {
                        await requestJson(
                          `/api/admin/campaigns/${campaign.id}/devices/${item.id}/reset`,
                          { method: "POST" },
                        );
                        setNotice(`Đã reset lượt cho ${item.code_hint}.`);
                        await refresh();
                      } catch (error) {
                        setNotice(
                          error instanceof Error ? error.message : "Không thể reset lượt.",
                        );
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Reset lượt
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {tab === "results" ? (
        <div className="editor-section">
          <div className="editor-heading">
            <div><h3>Kết quả & giao quà</h3><p>Chỉ admin có thể xem toàn bộ danh sách người thắng.</p></div>
            <button className="button button-ghost" onClick={() => downloadCsv(`${campaign.slug}-ket-qua.csv`, [["Thời gian", "Thiết bị", "Phần thưởng", "Trạng thái"], ...detail.spins.map((spin) => [spin.created_at, spin.code_hint, spin.prize_name, spin.fulfillment_status])])}>Xuất CSV</button>
          </div>
          <div className="data-table results-table">
            <div className="table-row table-head"><span>Thiết bị</span><span>Phần thưởng</span><span>Thời gian</span><span>Giao quà</span><span /></div>
            {detail.spins.map((spin) => (
              <div className="table-row" key={spin.id}>
                <strong>{spin.code_hint}</strong>
                <strong>{spin.prize_name}</strong>
                <span>{new Date(spin.created_at).toLocaleString("vi-VN")}</span>
                <span className={`fulfillment ${spin.fulfillment_status}`}>{spin.fulfillment_status === "fulfilled" ? "Đã trao" : "Chờ trao"}</span>
                <button onClick={async () => { await requestJson(`/api/admin/results/${spin.id}`, { method: "PATCH", body: JSON.stringify({ fulfilled: spin.fulfillment_status !== "fulfilled" }) }); await refresh(); }}>{spin.fulfillment_status === "fulfilled" ? "Hoàn tác" : "Đã trao"}</button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {tab === "audit" ? (
        <div className="editor-section">
          <div className="editor-heading"><div><h3>Nhật ký thay đổi</h3><p>Những thao tác quan trọng được lưu lại theo thời gian.</p></div></div>
          <div className="audit-list">
            {detail.audit.map((item) => (
              <article key={item.id}><span>●</span><div><strong>{item.action}</strong><small>{new Date(item.created_at).toLocaleString("vi-VN")}</small></div></article>
            ))}
            {!detail.audit.length ? <p>Chưa có thay đổi nào được ghi nhận.</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
