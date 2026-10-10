// Sản phẩm bán bằng tiền thật. GIÁ LÀ VÍ DỤ — chủ trang tự quyết định giá trước khi mở bán.

export interface Product {
  id: string;
  name: string;
  desc: string;
  /** Giá (VND). */
  amount: number;
  kind: "vip" | "coins";
  /** Số ngày VIP (kind = "vip"). */
  days?: number;
  /** Số xu (kind = "coins"). */
  coins?: number;
}

export const PRODUCTS: Product[] = [
  { id: "vip30", name: "VIP 30 ngày", desc: "Phân tích ván không giới hạn, 300 xu mỗi ngày, bàn cờ và khung VIP.", amount: 49_000, kind: "vip", days: 30 },
  { id: "vip365", name: "VIP 1 năm", desc: "Như VIP 30 ngày, tiết kiệm hơn 30%.", amount: 399_000, kind: "vip", days: 365 },
  { id: "coins5k", name: "5.000 xu", desc: "Mua bàn cờ, quân cờ, khung avatar.", amount: 20_000, kind: "coins", coins: 5_000 },
  { id: "coins30k", name: "30.000 xu", desc: "Tặng thêm 20% so với gói nhỏ.", amount: 99_000, kind: "coins", coins: 30_000 },
];

export const findProduct = (id: string) => PRODUCTS.find((p) => p.id === id) ?? null;

export const formatVnd = (n: number) => `${n.toLocaleString("vi-VN")} ₫`;
