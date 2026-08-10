import Link from "next/link";

const features = [
  {
    number: "01",
    title: "Tạo nhiều vòng quay",
    text: "Mỗi chiến dịch có link, thời gian, kho quà và thiết bị tham gia riêng.",
  },
  {
    number: "02",
    title: "Kiểm soát công bằng",
    text: "Xác suất được tính trên máy chủ, tự loại giải hết hàng và không trao quá kho.",
  },
  {
    number: "03",
    title: "Theo dõi đến khi trao quà",
    text: "Xem lịch sử, lọc kết quả, xuất CSV và đánh dấu từng quà đã bàn giao.",
  },
];

export default function Home() {
  return (
    <main className="landing">
      <nav className="landing-nav" aria-label="Điều hướng chính">
        <Link className="brand" href="/">
          <span className="brand-mark">Q</span>
          <span>Quay Vui</span>
        </Link>
        <div className="nav-actions">
          <a href="#hoat-dong">Cách hoạt động</a>
          <Link className="button button-ghost" href="/admin">
            Quản trị
          </Link>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow"><span /> Nền tảng vòng quay dành cho chiến dịch</p>
          <h1>
            Mỗi lượt quay,
            <br />
            một niềm vui <em>thật.</em>
          </h1>
          <p className="hero-lead">
            Tạo vòng quay riêng, kiểm soát xác suất và số lượng quà — rõ ràng
            cho admin, đơn giản cho người tham gia.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/admin">
              Tạo vòng quay <span>→</span>
            </Link>
            <Link
              className="text-link"
              href="/mua-he-may-man"
            >
              Xem bản trải nghiệm
            </Link>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="mini-wheel">
            <div className="mini-wheel-inner">
              <span>QUAY</span>
            </div>
          </div>
          <div className="prize-ticket ticket-one">
            <small>GIẢI MAY MẮN</small>
            <strong>500K</strong>
          </div>
          <div className="spark spark-one">✦</div>
          <div className="spark spark-two">✦</div>
        </div>
      </section>

      <section className="trust-strip" aria-label="Các lợi ích chính">
        <span>Không vượt kho quà</span>
        <i />
        <span>Một lượt trên mỗi thiết bị</span>
        <i />
        <span>Kết quả khóa trên máy chủ</span>
      </section>

      <section className="how-section" id="hoat-dong">
        <div className="section-heading">
          <p className="eyebrow"><span /> Từ ý tưởng đến vòng quay đang chạy</p>
          <h2>Ba bước để bắt đầu</h2>
        </div>
        <div className="feature-grid">
          {features.map((feature) => (
            <article className="feature-card" key={feature.number}>
              <span className="feature-number">{feature.number}</span>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
