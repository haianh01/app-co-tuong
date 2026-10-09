import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/site";
import styles from "../legal.module.css";

export const metadata: Metadata = { title: "Điều khoản sử dụng" };

// BẢN MẪU: thay các chỗ trong [NGOẶC VUÔNG] và nhờ luật sư rà soát trước khi áp dụng.
// Lưu ý pháp lý: trò chơi trực tuyến có nhiều người chơi tương tác qua máy chủ thuộc nhóm G1 theo
// Nghị định 147/2024/NĐ-CP — cần kiểm tra yêu cầu giấy phép trước khi kinh doanh.
export default function TermsPage() {
  const contact = CONTACT_EMAIL || "[EMAIL LIÊN HỆ]";
  return (
    <main className={styles.main}>
      <h1 className={styles.title}>Điều khoản sử dụng</h1>
      <p className={styles.updated}>Cập nhật lần cuối: [NGÀY CẬP NHẬT]</p>
      <p className={styles.draft}>
        Đây là bản mẫu. Chủ trang cần điền thông tin doanh nghiệp vào các chỗ trong [ngoặc vuông] và nhờ luật sư rà soát
        trước khi áp dụng.
      </p>

      <h2>1. Chấp nhận điều khoản</h2>
      <p>
        {SITE_NAME} (&quot;chúng tôi&quot;) do [TÊN DOANH NGHIỆP], mã số doanh nghiệp [MÃ SỐ], địa chỉ [ĐỊA CHỈ] vận hành. Khi tạo
        tài khoản hoặc sử dụng dịch vụ, bạn đồng ý với các điều khoản này và{" "}
        <Link href="/quyen-rieng-tu">Chính sách quyền riêng tư</Link>.
      </p>

      <h2>2. Tài khoản</h2>
      <ul>
        <li>Bạn chịu trách nhiệm giữ bí mật mật khẩu và mọi hoạt động trên tài khoản của mình.</li>
        <li>Người dưới 16 tuổi cần có sự đồng ý của cha mẹ hoặc người giám hộ khi đăng ký và sử dụng dịch vụ.</li>
        <li>Không dùng tên hiển thị mạo danh người khác, phản cảm hoặc vi phạm pháp luật.</li>
        <li>Mỗi người chỉ nên dùng một tài khoản cho đấu xếp hạng. Dùng nhiều tài khoản để thao túng điểm Elo bị nghiêm cấm.</li>
      </ul>

      <h2>3. Chơi công bằng</h2>
      <ul>
        <li>Không dùng phần mềm, máy tính hay người khác hỗ trợ trong ván đấu xếp hạng hoặc giải đấu.</li>
        <li>Không cố ý thua, dàn xếp kết quả hay khai thác lỗi hệ thống để trục lợi.</li>
        <li>Không quấy rối, lăng mạ người chơi khác.</li>
      </ul>
      <p>
        Vi phạm có thể dẫn tới cảnh báo, hủy kết quả ván đấu, thu hồi phần thưởng hoặc khóa tài khoản tạm thời hay vĩnh viễn.
      </p>

      <h2>4. Xu, vật phẩm ảo và gói VIP</h2>
      <ul>
        <li>Xu và vật phẩm ảo (bàn cờ, quân cờ, khung avatar) chỉ dùng trong {SITE_NAME}, không quy đổi thành tiền mặt và không chuyển nhượng.</li>
        <li>Bạn được cấp quyền sử dụng vật phẩm ảo trong thời gian tài khoản còn hoạt động, không phải quyền sở hữu.</li>
        <li>Gói VIP có hiệu lực theo thời hạn ghi khi mua và không tự động gia hạn.</li>
        <li>Giao dịch đã hoàn tất không được hoàn tiền, trừ trường hợp pháp luật quy định hoặc lỗi từ phía chúng tôi.</li>
      </ul>

      <h2>5. Thanh toán</h2>
      <p>
        Thanh toán được xử lý qua đối tác cổng thanh toán được cấp phép tại Việt Nam. Chúng tôi không lưu số thẻ hay thông tin
        đăng nhập ngân hàng của bạn.
      </p>

      <h2>6. Gián đoạn dịch vụ và giới hạn trách nhiệm</h2>
      <p>
        Dịch vụ được cung cấp theo hiện trạng. Chúng tôi cố gắng duy trì hoạt động liên tục nhưng không bảo đảm dịch vụ không bao
        giờ gián đoạn. Ván đấu bị gián đoạn do sự cố kỹ thuật có thể được hủy và không tính điểm.
      </p>

      <h2>7. Thay đổi điều khoản</h2>
      <p>
        Chúng tôi có thể cập nhật điều khoản và sẽ thông báo trên trang web khi có thay đổi quan trọng. Tiếp tục sử dụng dịch vụ
        sau khi cập nhật nghĩa là bạn chấp nhận điều khoản mới.
      </p>

      <h2>8. Luật áp dụng</h2>
      <p>
        Điều khoản này tuân theo pháp luật Việt Nam. Tranh chấp được ưu tiên giải quyết bằng thương lượng; nếu không thành, sẽ
        do tòa án có thẩm quyền tại [TỈNH/THÀNH PHỐ] giải quyết.
      </p>

      <h2>9. Liên hệ</h2>
      <p>Mọi thắc mắc về điều khoản, vui lòng liên hệ: {contact}.</p>
    </main>
  );
}
