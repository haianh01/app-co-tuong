// Bộ chuyển đổi và phiên âm Hán-Việt cho Kỳ Phổ Đại Sư và Khai Cuộc ECCO
// Giúp hiển thị danh tính kỳ thủ, địa phương và tên khai cuộc hoàn toàn bằng tiếng Việt chuẩn mực.

export interface TranslatedPlayer {
  fullName: string;
  playerName: string;
  province?: string;
  title?: string;
  displayName: string;
}

export const PROVINCES_MAP: Record<string, string> = {
  "上海": "Thượng Hải",
  "上海浦东": "Thượng Hải Phố Đông",
  "上海棋院": "Thượng Hải Kỳ Viện",
  "上海金外滩": "Thượng Hải Kim Ngoại Than",
  "广东": "Quảng Đông",
  "广东东莞日报": "Quảng Đông",
  "广东王老吉": "Quảng Đông",
  "广州": "Quảng Châu",
  "深圳": "Thâm Quyến",
  "黑龙江": "Hắc Long Giang",
  "黑龙江总汇长白山": "Hắc Long Giang",
  "哈尔滨": "Cáp Nhĩ Tân",
  "湖北": "Hồ Bắc",
  "湖北中盐宏博": "Hồ Bắc",
  "武汉": "Vũ Hán",
  "北京": "Bắc Kinh",
  "北京中加": "Bắc Kinh",
  "浙江": "Chiết Giang",
  "浙江球冠": "Chiết Giang",
  "浙江西贝乐宇宙": "Chiết Giang",
  "杭州": "Hàng Châu",
  "江苏": "Giang Tô",
  "江苏汤沟两相和": "Giang Tô",
  "江苏金陵人酒店队": "Giang Tô",
  "南京": "Nam Kinh",
  "河北": "Hà Bắc",
  "河北金环钢构": "Hà Bắc",
  "金环钢构": "Hà Bắc Kim Hoàn",
  "河南": "Hà Nam",
  "四川": "Tứ Xuyên",
  "成都": "Thành Đô",
  "吉林": "Cát Lâm",
  "辽宁": "Liêu Ninh",
  "沈阳": "Thẩm Dương",
  "大连": "Đại Liên",
  "大连益春堂": "Đại Liên",
  "山东": "Sơn Đông",
  "青岛": "Thanh Đảo",
  "山西": "Sơn Tây",
  "陕西": "Thiểm Tây",
  "西安": "Tây An",
  "湖南": "Hồ Nam",
  "天津": "Thiên Tân",
  "厦门": "Hạ Môn",
  "厦门港务控股": "Hạ Môn Cảng Vụ",
  "厦门港务集团": "Hạ Môn Cảng Vụ",
  "云南": "Vân Nam",
  "广西": "Quảng Tây",
  "贵州": "Quý Châu",
  "安徽": "An Huy",
  "福建": "Phúc Kiến",
  "江西": "Giang Tây",
  "甘肃": "Cam Túc",
  "甘肃中国通信移动": "Cam Túc",
  "青海": "Thanh Hải",
  "宁夏": "Ninh Hạ",
  "新疆": "Tân Cương",
  "内蒙古": "Nội Mông",
  "重庆": "Trùng Khánh",
  "海南": "Hải Nam",
  "澳门": "Ma Cao",
  "香港": "Hồng Kông",
  "台北": "Đài Bắc",
  "越南": "Việt Nam",
  "火车头": "Hỏa Xa Đầu",
  "煤矿体协": "Môi Khoáng",
  "林业体协": "Lâm Nghiệp",
  "农民体协": "Nông Dân",
  "农民协会": "Nông Dân",
  "冶金体协": "Dã Kim",
  "地质体协": "Địa Chất",
  "石化体协": "Thạch Hóa",
  "通信体协": "Thông Tin",
  "邮电体协": "Bưu Điện",
  "中汽体协": "Trung Khí",
  "大学生": "Đại Học Sinh",
  "八一": "Bát Nhất",
  "开滦": "Khai Loan",
  "南方棋院": "Nam Phương Kỳ Viện",
  "宋城": "Tống Thành",
};

export const SURNAMES_MAP: Record<string, string> = {
  "赵": "Triệu", "许": "Hứa", "吕": "Lữ", "胡": "Hồ", "王": "Vương", "郑": "Trịnh", "蒋": "Tưởng", "柳": "Liễu",
  "洪": "Hồng", "谢": "Tạ", "汪": "Uông", "孙": "Tôn", "徐": "Từ", "陶": "Đào", "李": "Lý", "阎": "Diêm",
  "刘": "Lưu", "栾": "Loan", "金": "Kim", "万": "Vạn", "聂": "Nhiếp", "苗": "Miêu", "董": "Đổng", "宗": "Tông",
  "景": "Cảnh", "何": "Hà", "党": "Đảng", "唐": "Đường", "孟": "Mạnh", "曹": "Tào", "庄": "Trang", "张": "Trương",
  "单": "Đơn", "伍": "Ngũ", "尤": "Vưu", "陈": "Trần", "黄": "Hoàng", "申": "Thân", "郝": "Hách", "程": "Trình",
  "崔": "Thôi", "林": "Lâm", "葛": "Cát", "宇": "Vũ", "邬": "Ổ", "康": "Khang", "章": "Chương", "薛": "Tiết",
  "黎": "Lê", "周": "Chu", "蔚": "Uất", "任": "Nhậm", "柯": "Kha", "毕": "Tất", "颜": "Nhan", "尚": "Thượng",
  "常": "Thường", "杨": "Dương", "臧": "Tang", "靳": "Cận", "龚": "Cung", "蔡": "Thái", "谭": "Đàm", "辛": "Tân",
  "吴": "Ngô", "彭": "Bành", "朱": "Chu", "汤": "Thang", "甘": "Cam", "马": "Mã", "荆": "Kinh", "梅": "Mai",
  "盖": "Cái", "侯": "Hầu", "霍": "Hoắc", "欧阳": "Âu Dương", "邓": "Đặng", "秦": "Tần", "卢": "Lư", "熊": "Hùng",
  "廖": "Liễu", "童": "Đồng", "陆": "Lục", "丰": "Phong", "武": "Vũ", "艾": "Ngải", "罗": "La", "肖": "Tiêu",
  "傅": "Phó", "韩": "Hàn", "梁": "Lương", "粱": "Lương", "高": "Cao", "白": "Bạch", "潘": "Phan", "郭": "Quách",
  "于": "Vu", "励": "Lệ", "曾": "Tăng", "文": "Văn", "叶": "Diệp", "杜": "Đỗ", "姚": "Diêu", "丁": "Đinh", "冯": "Phùng",
};

export const GIVEN_NAMES_MAP: Record<string, string> = {
  "鑫鑫": "Hâm Hâm", "银川": "Ngân Xuyên", "钦": "Khâm", "荣华": "Vinh Hoa", "天一": "Thiên Nhất", "惟桐": "Duy Đồng",
  "川": "Xuyên", "国荣": "Quốc Vinh", "大华": "Đại Hoa", "智": "Trí", "靖": "Tĩnh", "洋": "Dương", "勇征": "Dũng Chinh",
  "天红": "Thiên Hồng", "超": "Siêu", "汉明": "Hán Minh", "来群": "Lai Quần", "文清": "Văn Thanh", "殿中": "Điện Trung",
  "枫": "Phong", "波": "Ba", "春林": "Xuân Lâm", "铁文": "Thiết Văn", "斌": "Bân", "利明": "Lợi Minh", "旭彬": "Húc Bân",
  "岿": "Khôi", "永生": "Vĩnh Sinh", "学义": "Học Nghĩa", "刚": "Cương", "斐": "Phỉ", "国蕾": "Quốc Lôi", "丹": "Đan",
  "辰": "Thần", "岩磊": "Nham Lỗi", "玉庭": "Ngọc Đình", "玉腾": "Ngọc Đằng", "申宏": "Thân Hoành", "强": "Cường",
  "国凤": "Quốc Phụng", "霞丽": "Hà Lệ", "霞": "Hà", "颖钦": "Dĩnh Khâm", "幸琳": "Hạnh Lâm", "竹风": "Trúc Phong",
  "鹏": "Bằng", "继超": "Kế Siêu", "鸣": "Minh", "岩": "Nham", "少庚": "Thiếu Canh", "智屏": "Trí Bình", "智平": "Trí Bình",
  "锦欢": "Cẩm Hoan", "雪松": "Tuyết Tùng", "鸿嘉": "Hồng Gia", "艾东": "Ngải Đông", "德刚": "Đức Cương", "启忠": "Khải Trung",
  "婉华": "Uyển Hoa", "永鹏": "Vĩnh Bằng", "晓平": "Hiểu Bình", "琮思": "Tông Tư", "全胜": "Toàn Thắng", "卓淼": "Trác Diểu",
  "松": "Tùng", "聪": "Thông", "如意": "Như Ý", "庆利": "Khánh Lợi", "江": "Giang", "震": "Chấn", "勇": "Dũng",
  "太灵": "Thái Linh", "悦军": "Duyệt Quân", "幼华": "Ấu Hoa", "娴": "Nhàn", "群": "Quần", "海英": "Hải Anh",
  "望祥": "Vọng Tường", "进超": "Tiến Siêu", "倩": "Thiến", "忠才": "Trung Tài", "革联": "Cách Liên", "业枧": "Nghiệp Kiểm",
  "俊": "Tuấn", "启明": "Khải Minh", "冰": "Băng", "树成": "Thụ Thành", "大明": "Đại Minh", "家华": "Gia Hoa",
  "军": "Quân", "维杰": "Duy Kiệt", "海林": "Hải Lâm", "晓华": "Hiểu Hoa", "虎": "Hổ", "明海": "Minh Hải",
  "丛德": "Tùng Đức", "殿友": "Điện Hữu", "卓": "Trác", "菊花": "Cúc Hoa", "振波": "Chấn Ba", "道民": "Đạo Dân",
  "文学": "Văn Học", "保宏": "Bảo Hoành", "彬": "Bân", "启顺": "Khải Thuận", "江波": "Giang Ba", "星": "Tinh",
  "梅": "Mai", "嘉良": "Gia Lương", "思萌": "Tư Manh", "莉萍": "Lợi Bình", "琳娜": "Lâm Na", "健": "Kiện",
  "伟艳": "Vĩ Diễm", "昭忠": "Chiêu Trung", "光明": "Quang Minh", "明光": "Minh Quang", "征": "Chinh", "开林": "Khai Lâm",
  "志宁": "Chí Ninh", "新洲": "Tân Châu", "优": "Ưu", "吟辉": "Ngâm Huy", "飞": "Phi", "兵": "Binh",
  "威": "Uy", "宏": "Hoành", "二平": "Nhị Bình", "伟": "Vĩ", "婉莹": "Uyển Oánh", "学潮": "Học Triều",
  "弘": "Hoằng", "正源": "Chính Nguyên", "石": "Thạch", "浩华": "Hạo Hoa", "士峰": "Sĩ Phong", "久钦": "Cửu Khâm",
  "启泉": "Khải Tuyền", "伟频": "Vĩ Tần", "淑英": "Thục Anh", "轩": "Hiên", "首谦": "Thủ Khiêm", "伊": "Y",
  "德琪": "Đức Kỳ", "玉砚": "Ngọc Nghiễn", "晓民": "Hiểu Dân", "富杰": "Phú Kiệt", "仕清": "Sĩ Thanh",
  "文限": "Văn Hạn", "忠诚": "Trung Thành", "一泓": "Nhất Hoằng", "庆阳": "Khánh Dương", "峰": "Phong", "宇": "Vũ",
  "卓光": "Trác Quang", "小晋": "Tiểu Tấn", "玉锁": "Ngọc Tỏa", "亮": "Lượng", "志梁": "Chí Lương", "冬": "Đông",
  "寅": "Dần", "明强": "Minh Cường", "文山": "Văn Sơn", "玉虎": "Ngọc Hổ", "铁汉": "Thiết Hán", "羡勇": "Tiện Dũng",
  "静": "Tĩnh", "婵娟": "Thiền Quyên", "琦琳": "Kỳ Lâm", "颂宏": "Tụng Hoành", "永强": "Vĩnh Cường", "劲松": "Kính Tùng",
  "敏": "Mẫn", "文强": "Văn Cường", "奕祜": "Dịch Hỗ", "利琴": "Lợi Cầm", "鱼": "Ngư", "跃明": "Dược Minh",
  "学元": "Học Nguyên", "峥嵘": "Tranh Vanh", "鹤": "Hạc", "定一": "Định Nhất", "成龙": "Thành Long", "国敏": "Quốc Mẫn",
  "本平": "Bản Bình", "光智": "Quang Trí", "丹枫": "Đan Phong", "克雄": "Khắc Hùng", "文才": "Văn Tài", "伟滔": "Vĩ Thao",
  "图炯": "Đồ Quýnh", "善林": "Thiện Lâm", "俊超": "Tuấn Siêu", "乃东": "Nãi Đông", "冠芳": "Quán Phương", "剑": "Kiếm",
  "新年": "Tân Niên", "信安": "Tín An", "德志": "Đức Chí", "林": "Lâm",
  "彬彬": "Bân Bân", "文彤": "Văn Đồng", "志强": "Chí Cường", "正伟": "Chính Vĩ", "娜": "Na",
  "士强": "Sĩ Cường", "寒峰": "Hàn Phong", "维蒲": "Duy Bồ", "玮": "Vĩ", "宏敏": "Hoằng Mẫn",
};

/** Danh hiệu và phong tặng của các Đại sư danh tiếng */
export const MASTER_TITLES: Record<string, string> = {
  "许银川": "Kỳ vương – Thiếu niên Khương Thái Công",
  "Xu Yinchuan": "Kỳ vương – Thiếu niên Khương Thái Công",
  "赵鑫鑫": "Đặc cấp Đại sư – Lục Mạch Thần Kiếm",
  "Zhao Xinxin": "Đặc cấp Đại sư – Lục Mạch Thần Kiếm",
  "吕钦": "Kỳ vương – Khoái mã Phi đao",
  "Lv Qin": "Kỳ vương – Khoái mã Phi đao",
  "胡荣华": "Kỳ vương – Thập liên bá",
  "Hu Ronghua": "Kỳ vương – Thập liên bá",
  "王天一": "Kỳ vương – Ngoại tinh Lai khách",
  "Wang Tianyi": "Kỳ vương – Ngoại tinh Lai khách",
  "郑惟桐": "Kỳ vương – Thục sơn Thiếu hiệp",
  "Zheng Weitong": "Kỳ vương – Thục sơn Thiếu hiệp",
  "蒋川": "Kỳ vương – Ngọc diện Thần quân",
  "Jiang Chuan": "Kỳ vương – Ngọc diện Thần quân",
  "赵国荣": "Kỳ vương – Đông Bắc Hổ",
  "Zhao Guorong": "Kỳ vương – Đông Bắc Hổ",
  "柳大华": "Kỳ vương – Đông phương Thiết não",
  "Liu Dahua": "Kỳ vương – Đông phương Thiết não",
  "洪智": "Kỳ vương – Loạn chiến Chi vương",
  "Hong Zhi": "Kỳ vương – Loạn chiến Chi vương",
  "谢靖": "Đặc cấp Đại sư",
  "Xie Jing": "Đặc cấp Đại sư",
  "汪洋": "Kỳ vương",
  "Wang Yang": "Kỳ vương",
  "孙勇征": "Kỳ vương",
  "Sun Yongzheng": "Kỳ vương",
  "徐天红": "Kỳ vương – Tiếu diện Phật",
  "Xu Tianhong": "Kỳ vương – Tiếu diện Phật",
  "徐超": "Kỳ vương",
  "Xu Chao": "Kỳ vương",
  "陶汉明": "Kỳ vương – Nê Oa Kỳ vương",
  "Tao Hanming": "Kỳ vương – Nê Oa Kỳ vương",
  "李来群": "Kỳ vương – Trí đa tinh",
  "Li Laiqun": "Kỳ vương – Trí đa tinh",
  "唐丹": "Cửu quán vương nữ",
  "Tang Dan": "Cửu quán vương nữ",
  "孟辰": "Đặc cấp Đại sư",
  "Meng Chen": "Đặc cấp Đại sư",
  "曹岩磊": "Đặc cấp Đại sư – Khí tử Đại sư",
  "Cao Yanlei": "Đặc cấp Đại sư – Khí tử Đại sư",
  "阎文清": "Đặc cấp Đại sư – Bắc phương Kỳ kiếm",
  "Yan Wenqing": "Đặc cấp Đại sư – Bắc phương Kỳ kiếm",
  "刘殿中": "Đặc cấp Đại sư",
  "Liu Dianzhong": "Đặc cấp Đại sư",
  "王斌": "Đặc cấp Đại sư",
  "Wang Bin": "Đặc cấp Đại sư",
  "Li Xuesong": "Đại sư",
  "Jin Bo": "Đại sư",
  "Jing Xueyi": "Đại sư",
  "Zheng Yihong": "Đặc cấp Đại sư",
};

/** Map từ tên ID tiếng Anh sang tên tiếng Việt chuẩn của Đại sư */
export const MASTER_ENGLISH_TO_VN: Record<string, string> = {
  "Xu Yinchuan": "Hứa Ngân Xuyên",
  "Zhao Xinxin": "Triệu Hâm Hâm",
  "Lv Qin": "Lữ Khâm",
  "Hu Ronghua": "Hồ Vinh Hoa",
  "Wang Tianyi": "Vương Thiên Nhất",
  "Zheng Weitong": "Trịnh Duy Đồng",
  "Jiang Chuan": "Tưởng Xuyên",
  "Zhao Guorong": "Triệu Quốc Vinh",
  "Liu Dahua": "Liễu Đại Hoa",
  "Hong Zhi": "Hồng Trí",
  "Xie Jing": "Tạ Tĩnh",
  "Wang Yang": "Uông Dương",
  "Sun Yongzheng": "Tôn Dũng Chinh",
  "Xu Tianhong": "Từ Thiên Hồng",
  "Xu Chao": "Từ Siêu",
  "Tao Hanming": "Đào Hán Minh",
  "Li Laiqun": "Lý Lai Quần",
  "Yan Wenqing": "Diêm Văn Thanh",
  "Liu Dianzhong": "Lưu Điện Trung",
  "Wang Bin": "Vương Bân",
  "Li Xuesong": "Lý Tuyết Tùng",
  "Jin Bo": "Kim Ba",
  "Jing Xueyi": "Cảnh Học Nghĩa",
  "Zheng Yihong": "Trịnh Nhất Hoằng",
};

/** Dịch tên người chơi thô chữ Hán sang tên tiếng Việt chuẩn mực */
export function translatePlayer(raw: string | null | undefined): TranslatedPlayer {
  if (!raw || raw === "?" || raw === "? ?") {
    return {
      fullName: "Khuyết danh",
      playerName: "Khuyết danh",
      displayName: "Khuyết danh",
    };
  }

  const clean = raw.replace(/^v/, "").trim();
  if (clean.includes("Zheng YiHong")) {
    return {
      fullName: "Hạ Môn: Trịnh Nhất Hoằng",
      playerName: "Trịnh Nhất Hoằng",
      province: "Hạ Môn",
      title: "Đặc cấp Đại sư",
      displayName: "Hạ Môn: Trịnh Nhất Hoằng ⭐",
    };
  }

  let prov = "";
  let namePart = clean;

  const parts = clean.split(/\s+/);
  if (parts.length === 2) {
    prov = PROVINCES_MAP[parts[0]] || parts[0];
    namePart = parts[1];
  } else if (clean.startsWith("队")) {
    namePart = clean.slice(1);
  }

  // Loại bỏ tiền tố "队" (đội) nếu còn
  if (namePart.startsWith("队")) {
    namePart = namePart.slice(1);
  }

  let vnName = "";
  if (namePart.startsWith("欧阳")) {
    const gn = namePart.slice(2);
    vnName = "Âu Dương " + (GIVEN_NAMES_MAP[gn] || gn);
  } else {
    const s = namePart[0];
    const gn = namePart.slice(1);
    const vnS = SURNAMES_MAP[s] || s;
    const vnGn = GIVEN_NAMES_MAP[gn] || gn;
    vnName = vnS + " " + vnGn;
  }

  const title = MASTER_TITLES[namePart];
  const full = prov ? `${prov}: ${vnName}` : vnName;
  const display = title ? `${full} (${title})` : full;

  return {
    fullName: full,
    playerName: vnName,
    province: prov || undefined,
    title,
    displayName: display,
  };
}

/** Bảng quy đổi thuật ngữ khai cuộc tiếng Trung sang Hán-Việt */
const ECCO_REPLACEMENTS: [string, string][] = [
  ["七路马", " thất lộ mã "],
  ["屏风马", " Bình phong mã "],
  ["反宫马", " Phản cung mã "],
  ["单提马", " Đơn đề mã "],
  ["三步虎", " Tam bộ hổ "],
  ["顺炮", " Thuận pháo "],
  ["列炮", " Liệt pháo "],
  ["过宫炮", " Quá cung pháo "],
  ["士角炮", " Sĩ giác pháo "],
  ["仕角炮", " Sĩ giác pháo "],
  ["兵底炮", " Binh để pháo "],
  ["卒底炮", " Tốt để pháo "],
  ["金钩炮", " Kim câu pháo "],
  ["中炮", " Trung pháo "],
  ["两头蛇", " Lưỡng đầu xà "],
  ["仙人指路", " Tiên nhân chỉ lộ "],
  ["飞相", " Phi tượng "],
  ["飞象", " Phi tượng "],
  ["起马", " Khởi mã "],
  ["边马", " biên mã "],
  ["边相", " biên tượng "],
  ["过河车", " quá hà xa "],
  ["巡河车", " tuần hà xa "],
  ["骑河车", " kỵ hà xa "],
  ["直车", " trực xa "],
  ["横车", " hoành xa "],
  ["开车", " xuất xa "],
  ["过河炮", " quá hà pháo "],
  ["巡河炮", " tuần hà pháo "],
  ["过河", " quá hà "],
  ["巡河", " tuần hà "],
  ["边炮", " biên pháo "],
  ["盘河", " bàn hà "],
  ["封车", " phong xa "],
  ["五六炮", " Ngũ lục pháo "],
  ["五七炮", " Ngũ thất pháo "],
  ["五八炮", " Ngũ bát pháo "],
  ["五九炮", " Ngũ cửu pháo "],
  ["三兵", " tam binh "],
  ["七兵", " thất binh "],
  ["中兵", " trung binh "],
  ["３卒", " 3 tốt "],
  ["７卒", " 7 tốt "],
  ["中卒", " trung tốt "],
  ["边卒", " biên tốt "],
  ["打马", " đả mã "],
  ["打中卒", " đả trung tốt "],
  ["上仕", " thượng Sĩ "],
  ["上士", " thượng Sĩ "],
  ["互进", " cùng tiến "],
  ["连进", " liên tiến "],
  ["进", " tiến "],
  ["退", " thoái "],
  ["平", " bình "],
  ["兑", " đổi "],
  ["弃", " phế "],
  ["转", " chuyển "],
  ["对", " đối "],
  ["局", " cục "],
  ["红", " Đỏ "],
  ["黑", " Đen "],
  ["左", " tả "],
  ["右", " hữu "],
  ["双", " song "],
  ["缓", " hoãn "],
  ["先", " tiên "],
  ["后补", " hậu bổ "],
  ["外", " ngoại "],
  ["正马", " chính mã "],
  ["飞", " phi "],
  ["压", " áp "],
  ["上", " thượng "],
  ["马", " mã "],
  ["炮", " pháo "],
  ["车", " xa "],
  ["象", " tượng "],
  ["相", " tượng "],
  ["仕", " Sĩ "],
  ["士", " Sĩ "],
  ["兵", " binh "],
  ["卒", " tốt "],
  ["不", " bất "],
  ["高", " cao "],
  ["或", " hoặc "],
  ["打", " đả "],
];

/** Dịch tên khai cuộc chữ Hán sang tiếng Việt chuẩn */
export function translateEccoName(rawChinese: string | null | undefined, eccoCode?: string): string {
  if (!rawChinese || rawChinese.trim() === "") {
    return eccoCode ? `Hệ khai cuộc ${eccoCode}` : "Khai cuộc kinh điển";
  }

  let text = rawChinese;
  for (const [cn, vn] of ECCO_REPLACEMENTS) {
    text = text.split(cn).join(vn);
  }

  // Chuẩn hóa khoảng trắng và viết hoa chữ cái đầu
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/** Chuyển tên đại sư cho dropdown lọc */
export function getMasterDisplayName(masterKey: string): string {
  const vn = MASTER_ENGLISH_TO_VN[masterKey];
  if (vn) {
    const title = MASTER_TITLES[masterKey];
    return title ? `${vn} – ${title}` : vn;
  }
  return masterKey;
}
