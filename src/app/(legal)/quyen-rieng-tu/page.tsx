import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/site";
import styles from "../legal.module.css";

export const metadata: Metadata = { title: "Chính sách quyền riêng tư" };

// BẢN MẪU theo tinh thần Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân.
// Thay các chỗ trong [NGOẶC VUÔNG] và nhờ luật sư rà soát trước khi áp dụng.
export default function PrivacyPage() {
  const contact = CONTACT_EMAIL || "[EMAIL LIÊN HỆ]";
  return (
    <main className={styles.main}>
      <h1 className={styles.title}>Chính sách quyền riêng tư</h1>
      <p className={styles.updated}>Cập nhật lần cuối: [NGÀY CẬP NHẬT]</p>
      <p className={styles.draft}>
        Đây là bản mẫu. Chủ trang cần điền thông tin doanh nghiệp vào các chỗ trong [ngoặc vuông] và nhờ luật sư rà soát
        trước khi áp dụng.
      </p>

      <h2>1. Bên kiểm soát dữ liệu</h2>
      <p>
        [TÊN DOANH NGHIỆP], địa chỉ [ĐỊA CHỈ], email {contact}, là bên quyết định mục đích và cách xử lý dữ liệu cá nhân của
        người dùng {SITE_NAME}.
      </p>

      <h2>2. Dữ liệu chúng tôi thu thập</h2>
      <ul>
        <li><strong>Tài khoản:</strong> tên đăng nhập, tên hiển thị, mật khẩu (chỉ lưu dạng đã băm, không ai đọc được), email nếu bạn cung cấp.</li>
        <li><strong>Đăng nhập bằng Google hoặc Facebook:</strong> mã định danh tài khoản và tên do nền tảng đó cung cấp.</li>
        <li><strong>Hoạt động chơi:</strong> các ván đấu (nước đi, kết quả, thời gian), điểm Elo, tiến độ cờ thế, xu, vật phẩm đã mua.</li>
        <li><strong>Giao dịch:</strong> gói đã mua, số tiền, mã giao dịch của cổng thanh toán. Chúng tôi không lưu số thẻ hay thông tin ngân hàng.</li>
        <li><strong>Kỹ thuật:</strong> cookie phiên đăng nhập, địa chỉ IP và thời điểm truy cập trong nhật ký máy chủ.</li>
        <li><strong>Báo cáo vi phạm:</strong> nội dung bạn gửi khi báo cáo người chơi khác.</li>
      </ul>

      <h2>3. Mục đích xử lý</h2>
      <ul>
        <li>Cung cấp dịch vụ: đăng nhập, ghép cặp, tính điểm, lưu và hiển thị lịch sử ván đấu.</li>
        <li>Xử lý thanh toán và cấp vật phẩm, gói VIP.</li>
        <li>Bảo đảm chơi công bằng, phát hiện gian lận, xử lý báo cáo vi phạm.</li>
        <li>Gửi email cần thiết như khôi phục mật khẩu hay xác nhận email. Chúng tôi không gửi quảng cáo nếu bạn không đồng ý.</li>
      </ul>

      <h2>4. Thông tin công khai</h2>
      <p>
        Tên hiển thị, tên đăng nhập, điểm Elo, danh hiệu, thống kê và lịch sử ván đấu xếp hạng được hiển thị công khai trên bảng
        xếp hạng và trang hồ sơ. Email và giao dịch của bạn không bao giờ hiển thị công khai.
      </p>

      <h2>5. Chia sẻ dữ liệu</h2>
      <p>
        Chúng tôi không bán dữ liệu cá nhân. Dữ liệu chỉ được chia sẻ với các bên cần thiết để vận hành dịch vụ: cổng thanh toán,
        dịch vụ gửi email, nhà cung cấp máy chủ, hoặc cơ quan nhà nước có thẩm quyền theo quy định pháp luật.
      </p>

      <h2>6. Thời gian lưu trữ</h2>
      <p>
        Dữ liệu tài khoản được lưu trong thời gian tài khoản còn hoạt động. Khi bạn xóa tài khoản, thông tin cá nhân được xóa. Các
        ván đấu đã chơi được giữ lại dưới dạng ẩn danh để không làm sai lệch lịch sử của người chơi khác. Dữ liệu giao dịch được
        lưu theo thời hạn mà pháp luật về kế toán, thuế yêu cầu.
      </p>

      <h2>7. Quyền của bạn</h2>
      <p>
        Theo Nghị định 13/2023/NĐ-CP, bạn có quyền được biết, đồng ý hoặc rút lại sự đồng ý, truy cập, chỉnh sửa, yêu cầu xóa,
        hạn chế xử lý, phản đối xử lý dữ liệu và khiếu nại. Bạn có thể tự sửa thông tin và xóa tài khoản trong trang{" "}
        <Link href="/settings">Cài đặt</Link>, hoặc gửi yêu cầu tới {contact}.
      </p>

      <h2>8. Trẻ em</h2>
      <p>
        Người dưới 16 tuổi cần có sự đồng ý của cha mẹ hoặc người giám hộ trước khi đăng ký. Nếu phát hiện tài khoản của trẻ em
        được tạo mà không có sự đồng ý này, vui lòng liên hệ để chúng tôi xử lý.
      </p>

      <h2>9. Bảo mật và cookie</h2>
      <ul>
        <li>Mật khẩu được băm bằng thuật toán scrypt. Kết nối được mã hóa qua HTTPS.</li>
        <li>Chúng tôi chỉ dùng cookie cần thiết cho việc đăng nhập (<code>kd_session</code>). Cài đặt như bật/tắt âm thanh được lưu trên trình duyệt của bạn.</li>
        <li>Không dùng cookie quảng cáo hay theo dõi của bên thứ ba.</li>
      </ul>

      <h2>10. Thay đổi chính sách</h2>
      <p>Khi chính sách có thay đổi quan trọng, chúng tôi sẽ thông báo trên trang web trước khi áp dụng.</p>
    </main>
  );
}
